import React from 'react';
import { Animated, Easing, type FlatList, type NativeScrollEvent, type NativeSyntheticEvent, type View } from 'react-native';
import { destinoDoArrasto, offsetDoDeslize, velocidadeDoDeslize } from '../lib/arrastarFila';
import { TRACK_ROW_HEIGHT } from '../components/TrackRow';
import { hapticSelection } from '../lib/haptics';
import { segurarFluidez } from '../state/fluidez';

/**
 * O arrasto de uma lista de linhas (`LinhaArrastavel`): quem está pegada, o
 * deslize nas bordas e onde a linha aterra.
 *
 * Vivia dentro do `QueueSheet` e saiu para aqui a 28/9, quando a edição de uma
 * playlist passou a reordenar com o mesmo gesto da fila. Os comentários que
 * explicam cada peça vieram com ela.
 *
 * O arrasto vive aqui e não em cada linha: a linha pegada precisa de saber que
 * é ela, e as outras precisam de saber para onde se afastar.
 */
/** Quanto a linha largada demora a assentar no sítio novo. */
export const ASSENTAR_MS = 160;

export function useArrastarLista({ chaves, aoReordenar }: {
  /** Uma chave estável por linha, pela ordem da lista (ver `chavesEstaveis`). */
  chaves: readonly string[];
  /** A linha `de` aterrou em `para` -- já validado, e sempre diferentes. */
  aoReordenar: (de: number, para: number) => void;
}) {
  const [arrastar, setArrastar] = React.useState<number | null>(null);
  const dy = React.useRef(new Animated.Value(0)).current;
  // O mesmo que o `arrastar`, mas escrito no gesto e nao no render: e por ele
  // que a linha reclama o dedo e que a folha sabe que nao pode fechar. Ver
  // `LinhaArrastavel` -- um render de atraso era um movimento perdido.
  const pegadaRef = React.useRef<number | null>(null);
  // A chave da linha pegada. A lista pode andar por baixo do dedo (na fila, a
  // musica acaba e o `queueIndex` avanca): largar pelo indice movia outra.
  const chaveDaPegada = React.useRef<string | null>(null);
  /** Para a folha inferior não fechar com o gesto a meio (ver `BottomSheet`). */
  const bloqueioRef = React.useRef(false);
  // O toque longo PEGA na linha, mas o arrasto só arranca quando o dedo se
  // mexe. Levantá-lo sem mexer deixava a linha pegada para sempre e a lista
  // sem deslizar -- daí o `aoLevantar` a desfazer, e esta marca a distinguir
  // o dedo levantado do gesto que foi mesmo por diante.
  const pegou = React.useRef(false);
  /** Os 120 Hz enquanto a linha está pegada (state/fluidez.ts). */
  const largarFluidez = React.useRef<(() => void) | null>(null);
  /**
   * Quando acabou o último arrasto (25/10). Segurar uma música até pegar nela
   * e largar sem a mexer tocava-a: o `onPress` da linha chega no mesmo
   * levantar do dedo. Quem toca ao toque pergunta ao `acabouDeArrastar`.
   */
  const acabouEm = React.useRef(0);
  /** A linha a assentar no sítio depois de largada (ver `largar`). */
  const aAssentar = React.useRef<Animated.CompositeAnimation | null>(null);
  /** As chaves do render mais recente: o assentar acaba depois de o dedo sair. */
  const chavesRef = React.useRef(chaves);
  chavesRef.current = chaves;
  // Tudo o que o deslize nas bordas precisa de saber, e nada disto pode ser
  // estado: muda a cada frame do dedo e um `setState` por frame punha a lista
  // inteira a redesenhar durante o gesto.
  const listaRef = React.useRef<FlatList<any> | null>(null);
  const molduraRef = React.useRef<View | null>(null);
  /**
   * Onde a lista começa e acaba NO ECRÃ. O dedo vem em coordenadas de ecrã.
   *
   * **Medido ao pegar, e não no `onLayout`.** Era no `onLayout`, e essa medição
   * chega enquanto a folha ainda está a subir -- deslocada quase meio ecrã
   * para baixo. Nada voltava a medir quando ela assentava, por isso a lista
   * julgava o dedo sempre acima do topo: subia sozinha e nunca descia. Era o
   * "não dá para fazer scroll enquanto se arrasta". `NaN` = ainda por medir.
   */
  const limites = React.useRef({ topo: Number.NaN, fundo: Number.NaN });
  const alturaVisivel = React.useRef(0);
  const alturaDoConteudo = React.useRef(0);
  const offset = React.useRef(0);
  const offsetAoPegar = React.useRef(0);
  // `NaN` quer dizer que a linha foi escolhida pelo toque longo, mas ainda
  // não começou a ser arrastada. Antes começava em zero, que é sempre acima
  // da lista, e o auto-scroll puxava-a imediatamente para cima sozinho.
  const gesto = React.useRef({ dy: 0, dedoY: Number.NaN });

  /** Quanto a lista correu por baixo do dedo desde que ele pegou na linha. */
  const deslizou = () => offset.current - offsetAoPegar.current;
  /**
   * A linha segue o dedo E o que a lista correu, senão fica para trás.
   *
   * Estável de propósito: só lê referências, e recriá-la a cada render fazia
   * o intervalo do deslize ser desmontado e montado outra vez a cada frame.
   */
  const escreverDy = React.useCallback(
    () => dy.setValue(gesto.current.dy + offset.current - offsetAoPegar.current),
    [dy]
  );

  // Enquanto uma linha está pegada e o dedo está encostado a uma borda, a
  // lista corre sozinha. Sem isto o arrasto só alcança o que já está visível:
  // numa fila de cinquenta músicas dá para mover três lugares e mais nada.
  React.useEffect(() => {
    if (arrastar == null) return;
    const passo = setInterval(() => {
      const v = velocidadeDoDeslize(gesto.current.dedoY, limites.current.topo, limites.current.fundo);
      if (v === 0) return;
      const maximo = Math.max(0, alturaDoConteudo.current - alturaVisivel.current);
      const novo = offsetDoDeslize(offset.current, v, maximo, offsetAoPegar.current, alturaVisivel.current);
      if (novo === offset.current) return;
      offset.current = novo;
      listaRef.current?.scrollToOffset({ offset: novo, animated: false });
      escreverDy();
    }, 16);
    return () => clearInterval(passo);
  }, [arrastar, escreverDy]);
  // Medida em vez de assumida: meio pixel de erro por linha desalinha o gesto
  // todo ao fim de dez. O `TRACK_ROW_HEIGHT` serve so ate a primeira medicao.
  const [altura, setAltura] = React.useState(TRACK_ROW_HEIGHT);

  /** A lista para de deslizar ao dedo, ja -- sem esperar pelo render. */
  const travarLista = (travada: boolean) => {
    // O `scrollEnabled` da prop chega um render depois, e um arrasto rapido
    // pela pega podia ser apanhado antes pelo deslize nativo da lista. Os dois
    // lados chamam isto, para o nativo nunca ficar preso num estado que o
    // React nao conhece.
    try { (listaRef.current as any)?.setNativeProps?.({ scrollEnabled: !travada }); } catch { /* sem isto vale a prop */ }
  };

  /**
   * As bordas da lista, NA PRÓPRIA LISTA (3/10): de 0 à altura dela. Eram
   * medidas no ecrã (`measureInWindow`), e o dedo também -- mas a fila passou
   * a uma folha nativa do iOS, e lá dentro o `measureInWindow` não conta com
   * onde a folha está enquanto o dedo vem do UIKit, no ecrã a sério. A lista
   * julgava o dedo fora dela e corria sozinha: as linhas abriam buracos. Agora
   * só a ALTURA vem da medição, e o dedo é medido em relação à moldura.
   */
  const medirLimites = () => {
    limites.current = { topo: Number.NaN, fundo: Number.NaN };
    molduraRef.current?.measure((_x, _y, _l, h) => {
      if (pegadaRef.current == null) return; // o arrasto ja acabou
      alturaVisivel.current = h;
      limites.current = { topo: 0, fundo: h };
    });
  };
  /** Onde estava o dedo DENTRO da moldura quando pegou na linha (`NaN` = por medir). */
  const dedoAoPegar = React.useRef(Number.NaN);

  const comecarArrasto = (index: number) => {
    // A anterior ainda a assentar no sítio: um arrasto de cada vez.
    if (aAssentar.current) return;
    hapticSelection();
    largarFluidez.current?.();
    largarFluidez.current = segurarFluidez(500);
    pegadaRef.current = index;
    chaveDaPegada.current = chaves[index] ?? null;
    bloqueioRef.current = true;
    pegou.current = false;
    gesto.current = { dy: 0, dedoY: Number.NaN };
    offsetAoPegar.current = offset.current;
    dy.setValue(0);
    travarLista(true);
    medirLimites();
    setArrastar(index);
  };

  const terminarArrasto = () => {
    if (pegadaRef.current != null) acabouEm.current = Date.now();
    largarFluidez.current?.();
    largarFluidez.current = null;
    pegadaRef.current = null;
    chaveDaPegada.current = null;
    bloqueioRef.current = false;
    pegou.current = false;
    gesto.current = { dy: 0, dedoY: Number.NaN };
    limites.current = { topo: Number.NaN, fundo: Number.NaN };
    travarLista(false);
    // O `dy` NAO volta a zero aqui. Voltava, e antes de a lista se reordenar:
    // durante um frame a linha regressava ao sitio de onde veio e depois
    // saltava para o novo. Com o `arrastar` a null nenhuma linha le o `dy`, e
    // o proximo arrasto poe-no a zero ao comecar.
    setArrastar(null);
  };

  // A lista pode mudar por baixo do dedo -- na fila, a musica acaba e o
  // `queueIndex` avanca, e as linhas sobem uma posicao. Continuar a arrastar
  // pelo indice era pegar noutra; larga-se sem mexer em nada.
  React.useEffect(() => {
    if (arrastar != null && chaves[arrastar] !== chaveDaPegada.current) terminarArrasto();
  });

  /**
   * Largar (25/10: "muito snappy"). A linha já não salta para o sítio novo:
   * ASSENTA lá em ~0,16 s, e só então a lista se reordena -- no mesmo frame
   * em que os deslocamentos voltam a zero, por isso não se vê costura. Largar
   * no sítio de onde veio é voltar lá a deslizar.
   */
  const largar = (dyFinal: number) => {
    // O que a lista correu conta tanto como o que o dedo andou: sem isto a
    // linha aterra onde o dedo está no ecrã, e não onde ela parece estar.
    const percorrido = dyFinal + deslizou();
    const chave = chaveDaPegada.current;
    // Pela chave, e nao pelo indice com que se pegou.
    const de = chave ? chaves.indexOf(chave) : -1;
    const para = de < 0 ? -1 : destinoDoArrasto(de, percorrido, altura, chaves.length);
    const muda = de >= 0 && para !== de && para >= 0 && para < chaves.length;
    // O deslize das bordas para: o dedo já saiu.
    gesto.current = { dy: gesto.current.dy, dedoY: Number.NaN };
    const assentar = Animated.timing(dy, {
      toValue: muda ? (para - de) * altura : 0,
      duration: ASSENTAR_MS,
      easing: Easing.out(Easing.cubic),
      // O `dy` não está ligado a vista nenhuma: as linhas ouvem-no e escrevem
      // no valor delas. Por isso é do JS.
      useNativeDriver: false,
    });
    aAssentar.current = assentar;
    assentar.start(() => {
      if (aAssentar.current !== assentar) return;
      aAssentar.current = null;
      // A lista pode ter mudado por baixo enquanto assentava (a música acabou):
      // aí já se largou sem mexer em nada.
      const ainda = chave != null && chaveDaPegada.current === chave;
      terminarArrasto();
      if (!ainda || !muda || chavesRef.current.indexOf(chave) !== de) return;
      hapticSelection();
      aoReordenar(de, para);
    });
  };

  return {
    /** Qual das linhas está pegada, para o desenho. `null` = nenhuma. */
    arrastar,
    /**
     * Há uma linha pegada, ou acabou de ser largada. O `onPress` de uma linha
     * que se segurou até pegar chega no mesmo levantar do dedo, antes ou
     * depois do fim do gesto: nos dois casos não é um toque.
     */
    acabouDeArrastar: () => pegadaRef.current != null || Date.now() - acabouEm.current < 600,
    bloqueioRef,
    listaRef,
    molduraRef,
    comecarArrasto,
    terminarArrasto,
    /** As props de cada `LinhaArrastavel`, menos `podeArrastar` e os filhos. */
    propsDaLinha: (index: number) => ({
      index,
      arrastarIndex: arrastar,
      pegadaRef,
      altura,
      dy,
      total: chaves.length,
      aoComecar: comecarArrasto,
      /**
       * O arrasto arrancou com o dedo `yNaVista` pontos abaixo do topo de
       * `vista` (a linha, ou a pega). A posição da vista na moldura mede-se
       * entre as duas (`measureLayout`): as duas estão na mesma folha, e não
       * importa onde a folha está no ecrã.
       */
      aoPegar: (yNaVista: number, vista: View | null) => {
        pegou.current = true;
        offsetAoPegar.current = offset.current;
        dedoAoPegar.current = Number.NaN;
        gesto.current = { dy: 0, dedoY: Number.NaN };
        const moldura = molduraRef.current;
        if (!vista || !moldura) return;
        try {
          vista.measureLayout(moldura as never, (_x, y) => {
            if (pegadaRef.current == null) return;
            dedoAoPegar.current = y + yNaVista;
            gesto.current = { dy: gesto.current.dy, dedoY: dedoAoPegar.current + gesto.current.dy };
          }, () => { /* sem medida não há deslize nas bordas, e mais nada muda */ });
        } catch { /* idem */ }
      },
      aoMover: (d: number) => {
        gesto.current = { dy: d, dedoY: dedoAoPegar.current + d };
        escreverDy();
      },
      aoLargar: largar,
      aoCancelar: terminarArrasto,
    }),
    /**
     * O `onPressOut` da linha que o toque longo pegou. Chega TAMBEM quando o
     * arrasto rouba o dedo: o adiamento de um tick deixa o `aoPegar` chegar
     * primeiro e dizer que nao foi um dedo levantado.
     */
    aoLevantar: (index: number) => {
      setTimeout(() => {
        if (pegou.current || pegadaRef.current !== index) return;
        terminarArrasto();
      }, 0);
    },
    /** Para a lista: o `onScroll` e o `onContentSizeChange`. */
    aoRolar: (e: NativeSyntheticEvent<NativeScrollEvent>) => { offset.current = e.nativeEvent.contentOffset.y; },
    aoMudarTamanho: (_w: number, h: number) => { alturaDoConteudo.current = h; },
    /** A altura medida da primeira linha (o `onLayout` dela). */
    medirLinha: (h: number) => { if (h > 0 && Math.abs(h - altura) > 0.5) setAltura(h); },
  };
}
