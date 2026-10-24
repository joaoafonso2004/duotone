import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { posicaoDoMenu, posicaoDoSubmenu } from '../lib/menuDoAmigo';
import { COR, FONT, RAIO, TIPO } from './tokens.web';
import { marcar } from './ui.web';
import { pausarAtalhosDaJanela } from './useAtalhosDaJanela.web';

// Sem tipos instalados para o react-dom; só se usa o portal.
const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };

export type LinhaDoMenu = {
  id: string;
  rotulo: string;
  /** Nome de um ícone do Ionicons. */
  icone: string;
  perigo?: boolean;
  inicioDeGrupo?: boolean;
  /** Indisponível agora: a linha fica apagada e diz porquê por baixo. */
  motivo?: string | null;
  /** Abre um painel ao lado em vez de escolher (o "Add to playlist ›", 24/10). */
  submenu?: boolean;
};

export type PontoNoEcra = { x: number; y: number };

/** O que o painel de uma linha recebe: fechar o menu todo, ou voltar à linha. */
export type ControloDoSubmenu = { fechar: () => void; voltar: () => void };

/**
 * Onde abrir um menu a partir de um clique: o rato, se o evento o traz; senão
 * o último sítio onde se carregou (`ultimoClique`); sem nenhum, o meio da janela.
 */
let ultimo: PontoNoEcra | null = null;
/**
 * Do teclado (Shift+F10, a tecla de menu; 24/10) o `contextmenu` pode vir sem
 * rato, em 0,0: o menu abre junto do que tem o foco, e não no canto da janela.
 */
function pontoDe(n: any): PontoNoEcra | null {
  const x = n?.clientX ?? n?.pageX, y = n?.clientY ?? n?.pageY;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (x === 0 && y === 0) {
    const r = n?.target?.getBoundingClientRect?.();
    if (r) return { x: r.left + Math.min(24, r.width / 2), y: r.top + Math.min(32, r.height) };
  }
  return { x, y };
}
if (typeof window !== 'undefined') {
  const guardar = (e: MouseEvent) => { ultimo = pontoDe(e) ?? ultimo; };
  window.addEventListener('mousedown', guardar, true);
  window.addEventListener('contextmenu', guardar, true);
}
export function ultimoClique(): PontoNoEcra {
  if (ultimo) return ultimo;
  return typeof window === 'undefined' ? { x: 0, y: 0 } : { x: window.innerWidth / 2, y: window.innerHeight / 3 };
}
export function pontoDoEvento(e: any): PontoNoEcra {
  return pontoDe(e?.nativeEvent ?? e) ?? ultimoClique();
}

const LARGURA = 280;
/** O rato a passar por cima de "Add to playlist" a caminho de outra linha não o abre. */
const ESPERA_DO_SUBMENU = 150;

const caixaDoMenu = {
  position: 'fixed', padding: 6, borderRadius: 14, backgroundColor: '#18181F',
  borderWidth: 1, borderColor: '#33333C', boxShadow: '0 16px 40px rgba(0,0,0,.55)',
  maxHeight: 'calc(100vh - 16px)',
} as const;

/**
 * Quem trata das suas teclas (a procura de um painel): o menu não lhas tira.
 * Um atributo à parte, e não um `marcar`: as marcas são para o CSS.
 */
export const TECLAS_PROPRIAS = { dataSet: { teclas: 'proprias' } } as any;
const temTeclasProprias = (alvo: any) => !!alvo?.closest?.('[data-teclas="proprias"]');

/**
 * O menu de contexto do PC (5/10, auditoria de consistência M1): abre onde
 * está o rato, como se espera num desktop. O clique direito numa faixa abria
 * um diálogo ao CENTRO do ecrã ("Track Actions"), longe do cursor; só o menu
 * de um amigo da lateral abria no sítio. Agora são todos este: faixas,
 * playlists, atalhos da lateral e amigos.
 *
 * Fecha com um clique fora, Esc, a roda do rato fora dele, ou a janela a perder
 * o foco; as setas, Home e End andam pelas linhas. Enquanto está aberto, os
 * atalhos da janela (espaço, setas) ficam parados. Escolher fecha-o ANTES de
 * executar.
 *
 * Uma linha com `submenu` (24/10) abre um painel ao lado, como num sistema
 * operativo: com o rato parado nela, ao clicar, com Enter ou com →. Passar para
 * outra linha fecha-o; Esc ou ← dentro dele voltam à linha. Um menu só com
 * `corpo` é um painel destes sozinho (o "Add to playlist" do Now Playing).
 */
export function MenuDeContexto({ rato, rotulo, cabecalho, linhas, corpo, submenu, aoEscolher, aoFechar }: {
  rato: PontoNoEcra;
  /** O nome do menu para o leitor de ecrã ("Options for ..."). */
  rotulo: string;
  cabecalho?: React.ReactNode;
  linhas: readonly LinhaDoMenu[];
  /** No lugar das linhas. */
  corpo?: React.ReactNode;
  /** O painel da linha com `submenu`. */
  submenu?: (controlo: ControloDoSubmenu) => React.ReactNode;
  aoEscolher: (id: string) => void;
  aoFechar: () => void;
}) {
  const caixa = useRef<any>(null);
  const painel = useRef<any>(null);
  const itens = useRef<any[]>([]);
  const nosDasLinhas = useRef(new Map<string, any>());
  const [onde, setOnde] = useState<PontoNoEcra | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [ondePainel, setOndePainel] = useState<PontoNoEcra | null>(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  const abertoAgora = useRef(aberto);
  abertoAgora.current = aberto;
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parar = () => { if (relogio.current) { clearTimeout(relogio.current); relogio.current = null; } };
  const depois = (f: () => void) => { parar(); relogio.current = setTimeout(f, ESPERA_DO_SUBMENU); };
  const abrir = (id: string) => {
    parar();
    if (abertoAgora.current === id) return;
    setOndePainel(null);
    setAberto(id);
  };
  const fecharPainel = () => { parar(); setAberto(null); setOndePainel(null); };
  const voltar = useRef(() => {});
  voltar.current = () => {
    const id = abertoAgora.current;
    fecharPainel();
    if (id) nosDasLinhas.current.get(id)?.focus?.();
  };

  useEffect(() => {
    pausarAtalhosDaJanela(true);
    const dentro = (alvo: any) => !!(caixa.current?.contains?.(alvo) || painel.current?.contains?.(alvo));
    const fora = (e: MouseEvent) => { if (!dentro(e.target)) fechar.current(); };
    const tecla = (e: KeyboardEvent) => {
      if (temTeclasProprias(e.target)) return;
      if (painel.current?.contains?.(e.target)) {
        if (e.key === 'Escape' || e.key === 'ArrowLeft') { e.preventDefault(); voltar.current(); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); fechar.current(); return; }
      if (e.key === 'ArrowRight') {
        for (const [id, no] of nosDasLinhas.current) {
          if (no && no === document.activeElement) { e.preventDefault(); abrir(id); return; }
        }
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      const lista = itens.current.filter(Boolean);
      if (!lista.length) return;
      const agora = lista.indexOf(document.activeElement);
      const proximo = e.key === 'Home' ? 0 : e.key === 'End' ? lista.length - 1
        : e.key === 'ArrowDown' ? (agora + 1) % lista.length : (agora <= 0 ? lista.length - 1 : agora - 1);
      lista[proximo]?.focus?.();
    };
    const sair = () => fechar.current();
    // A roda dentro do menu ou do painel é para andar na lista dele.
    const roda = (e: WheelEvent) => { if (!dentro(e.target)) fechar.current(); };
    document.addEventListener('mousedown', fora, true);
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('blur', sair);
    window.addEventListener('resize', sair);
    window.addEventListener('wheel', roda, { passive: true });
    return () => {
      pausarAtalhosDaJanela(false);
      parar();
      document.removeEventListener('mousedown', fora, true);
      window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('blur', sair);
      window.removeEventListener('resize', sair);
      window.removeEventListener('wheel', roda);
    };
  }, []);

  // Um painel aberto (ou um menu que é só um) começa com o foco no campo dele.
  useEffect(() => {
    if (ondePainel) painel.current?.querySelector?.('input')?.focus?.();
  }, [!!ondePainel]);
  useEffect(() => {
    if (onde && corpo) caixa.current?.querySelector?.('input')?.focus?.();
  }, [!!onde]);

  const virado = onde ? { x: onde.x < rato.x, y: onde.y < rato.y } : { x: false, y: false };
  const disponiveis = linhas.filter((l) => !l.motivo);
  const linhaAberta = aberto ? linhas.find((l) => l.id === aberto) : undefined;

  const menu = (
    <View
      ref={caixa}
      accessibilityRole={'menu' as any}
      accessibilityLabel={rotulo}
      onLayout={(e) => {
        if (onde) return;
        const { width, height } = e.nativeEvent.layout;
        setOnde(posicaoDoMenu(rato, { largura: width, altura: height }, { largura: window.innerWidth, altura: window.innerHeight }));
      }}
      {...(onde ? marcar('menu-amigo') : {})}
      style={{
        ...caixaDoMenu, zIndex: 300, width: LARGURA, left: onde?.x ?? rato.x, top: onde?.y ?? rato.y,
        opacity: onde ? 1 : 0, overflowY: 'auto',
        transformOrigin: `${virado.y ? 'bottom' : 'top'} ${virado.x ? 'right' : 'left'}`,
      } as any}
    >
      {cabecalho ? <View style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 10 }}>{cabecalho}</View> : null}
      {corpo ?? linhas.map((l) => {
        const apagada = !!l.motivo;
        const i = disponiveis.indexOf(l);
        const comPainel = !!l.submenu && !!submenu && !apagada;
        return (
          <React.Fragment key={l.id}>
            {l.inicioDeGrupo ? <View style={{ height: 1, backgroundColor: COR.linhaSuave, marginVertical: 5, marginHorizontal: 6 }} /> : null}
            <Pressable
              ref={apagada ? undefined : (n: any) => { itens.current[i] = n; if (comPainel) nosDasLinhas.current.set(l.id, n); }}
              accessibilityRole={'menuitem' as any}
              accessibilityState={{ disabled: apagada, expanded: comPainel ? aberto === l.id : undefined }}
              disabled={apagada}
              {...(apagada ? {} : marcar('menu-linha'))}
              onHoverIn={() => {
                if (comPainel) depois(() => abrir(l.id));
                else if (abertoAgora.current) depois(fecharPainel);
                else parar();
              }}
              onHoverOut={() => { if (comPainel && abertoAgora.current !== l.id) parar(); }}
              onPress={() => {
                if (comPainel) { abrir(l.id); return; }
                fechar.current(); aoEscolher(l.id);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: apagada ? 7 : 9, paddingHorizontal: 10,
                borderRadius: RAIO.cartao, cursor: apagada ? 'default' : undefined,
                backgroundColor: aberto === l.id ? 'rgba(233,234,238,.07)' : undefined,
              } as any}
            >
              <Ionicons name={l.icone as any} size={17} color={l.perigo ? COR.erro : COR.textoMedio} style={{ opacity: apagada ? 0.4 : 1 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ ...TIPO.corpo, color: l.perigo ? COR.erro : COR.texto, opacity: apagada ? 0.4 : 1 }}>{l.rotulo}</Text>
                {l.motivo ? <Text numberOfLines={2} style={{ fontFamily: FONT.body, fontSize: 11, color: COR.textoFraco, marginTop: 2 }}>{l.motivo}</Text> : null}
              </View>
              {comPainel ? <Ionicons name="chevron-forward" size={15} color={COR.textoFraco} /> : null}
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );

  // O painel é um portal à parte, e não um filho do menu: a animação de
  // entrada do menu é um `transform`, e um `position: fixed` lá dentro ficava
  // preso a ele.
  const lado = aberto && submenu && linhaAberta ? (
    <View
      ref={painel}
      accessibilityRole={'menu' as any}
      accessibilityLabel={linhaAberta.rotulo}
      onMouseEnter={parar}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        // Mede-se ao abrir, e outra vez só se crescer para fora da janela:
        // filtrar não o faz saltar debaixo do rato.
        if (ondePainel && ondePainel.y + height <= window.innerHeight - 8) return;
        const linha = nosDasLinhas.current.get(aberto)?.getBoundingClientRect?.();
        const doMenu = caixa.current?.getBoundingClientRect?.();
        if (!linha || !doMenu) return;
        setOndePainel(posicaoDoSubmenu({ topo: linha.top }, { esquerda: doMenu.left, direita: doMenu.right },
          { largura: width, altura: height }, { largura: window.innerWidth, altura: window.innerHeight }));
      }}
      {...(ondePainel ? marcar('menu-amigo') : {})}
      style={{
        ...caixaDoMenu, zIndex: 301, width: LARGURA, left: ondePainel?.x ?? 0, top: ondePainel?.y ?? 0,
        opacity: ondePainel ? 1 : 0, transformOrigin: ondePainel && onde && ondePainel.x < onde.x ? 'top right' : 'top left',
      } as any}
    >
      {submenu({ fechar: () => fechar.current(), voltar: () => voltar.current() })}
    </View>
  ) : null;

  return createPortal(<>{menu}{lado}</>, document.body);
}
