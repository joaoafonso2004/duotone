import { useEffect, useRef } from 'react';
import { registarFimNaSessao, registarOuvirJuntos, usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { correccaoNecessaria, velocidadeAAplicar } from '../lib/sincronizacao';
import { cachedAudioFile } from '../lib/youtubeCache';
import { appEstaVisivel } from '../lib/appVisibility';
import { decisaoDeArranque } from '../lib/sessaoViva';

/**
 * O que faz uma sessão de escuta acontecer no leitor.
 *
 * Três trabalhos, e por esta ordem de importância:
 *
 *  1. **A faixa.** A sessão diz qual é; se não for a que está a tocar aqui,
 *     toca-se essa. É a única parte que tem de estar certa sempre -- estar
 *     desencontrado meio segundo é um detalhe, estar noutra música não é ouvir
 *     junto de todo.
 *
 *  2. **Pausa e retoma.** Quem manda carrega em pausa e a música pára em toda a
 *     gente.
 *
 *  3. **O alinhamento.** A parte que se vê nos vídeos e a menos importante das
 *     três. Corrige-se pela velocidade dentro de meio segundo, e só se salta
 *     acima disso. Ver `lib/sincronizacao.ts`.
 *
 * ## Quem obedece a quem
 *
 * Só se obedece à sessão quando NÃO somos nós a mandar nela. Um anfitrião que
 * obedecesse ao seu próprio anúncio entrava em ciclo: mudava a faixa, o servidor
 * respondia com a mudança, e ele voltava a aplicá-la a si próprio.
 *
 * ## Porque é que a espera é visível
 *
 * No Duotone tocar uma faixa é descarregá-la primeiro. Um convidado pode estar
 * trinta segundos sem som nenhum enquanto o anfitrião já vai a meio -- e isso
 * não é avaria, é a rede dele. O `anunciarProntidao` é o que permite à barra da
 * sessão dizer "miguel a descarregar" em vez de deixar toda a gente a olhar
 * para um silêncio sem explicação.
 */

/** De quanto em quanto tempo se compara a nossa posição com a da sessão. */
const AFINACAO_MS = 2000;

/**
 * Quanto tempo se fica quieto depois de um salto.
 *
 * ISTO É O QUE TIRAVA O SOM AOS CONVIDADOS. A posição que a store guarda vem do
 * `timeUpdate` do motor, que chega cerca de uma vez por segundo -- e um salto
 * demora ainda mais a aparecer lá, porque o AVPlayer tem de reencher o buffer.
 *
 * Sem esta pausa, a comparação seguinte via a posição de ANTES do salto,
 * concluía que continuávamos atrasados, e saltava outra vez. E outra. Cada
 * salto corta o som -- o resultado era música aos pedaços do princípio ao fim.
 *
 * Cinco segundos é folga que chega para o salto assentar e para a posição
 * voltar a ser verdade.
 */
const DESCANSO_APOS_SALTO_MS = 5000;

/**
 * Quantas leituras seguidas fora do sítio antes de saltar.
 *
 * Uma medição isolada pode ser ruído: o `timeUpdate` atrasou-se, a rede deu um
 * soluço. Saltar por causa dela corta o som por nada. Duas leituras seguidas a
 * dizer o mesmo já é um desvio real.
 */
const LEITURAS_PARA_SALTAR = 2;

/**
 * Quantos saltos se dão por faixa antes de desistir do alinhamento.
 *
 * O travão que faltava, e o que quebra o ciclo.
 *
 * Cada salto obriga o AVPlayer a reencher o buffer. Num telemóvel com rede pior,
 * esse reenchimento faz a pessoa ficar AINDA mais atrasada -- o que provoca
 * outro salto, que provoca outro reenchimento. Realimentação: quanto mais se
 * corrige, mais correcção é preciso, e o som fica aos pedaços do princípio ao
 * fim da música.
 *
 * Ao segundo salto sem sucesso desiste-se do alinhamento até à faixa seguinte.
 * Ficam alguns segundos desencontrados -- e isso é MUITO menos mau do que a
 * música picotada. Está escrito no cabeçalho deste ficheiro e vale a pena
 * repetir: das três coisas que isto faz, o alinhamento é a menos importante.
 * A faixa certa e a pausa é que não se negoceiam.
 */
const SALTOS_POR_FAIXA = 2;

export function useSincroniaDaSessao(): void {
  const sessao = useOuvirJuntos((s) => s.sessao);
  const posicaoAgora = useOuvirJuntos((s) => s.posicaoAgora);
  const souAnfitriao = useOuvirJuntos((s) => s.souAnfitriao);
  const anunciarProntidao = useOuvirJuntos((s) => s.anunciarProntidao);

  // A store do leitor precisa de saber se ha sessao para decidir o que um toque
  // numa musica quer dizer -- mas nao pode importar o ouvir-juntos, que e uma
  // camada acima dela. Regista-se aqui, como o `registarFimNaSessao`.
  useEffect(() => {
    registarOuvirJuntos(() => {
      const s = useOuvirJuntos.getState();
      return s.sessao ? { sessao: s.sessao, sugerir: s.sugerir } : null;
    });
    return () => registarOuvirJuntos(() => null);
  }, []);

  /** A faixa que toca AQUI. O efeito 1 reage a ela e não só à da sessão. */
  const faixaLocalDoConvidado = usePlayer((s) => s.current?.sourceId);

  /** A última faixa que ESTA sessão nos mandou tocar. */
  const ultimaMandada = useRef<string | null>(null);
  const ultimaProntidao = useRef<boolean | null>(null);

  /**
   * Dá tempo a quem ainda está a descarregar, até ao tecto.
   *
   * Sonda de meio em meio segundo em vez de esperar o tecto todo: quando estão
   * todos prontos em dois segundos, arranca aos dois segundos. Uma espera fixa
   * era o pior dos dois mundos -- lenta quando não era preciso e curta quando
   * era.
   */
  const esperarPorTodos = async () => {
    const inicio = Date.now();
    for (;;) {
      const s = useOuvirJuntos.getState();
      if (!s.sessao) return;
      const d = decisaoDeArranque({
        membros: s.membros,
        agora: Date.now(),
        desdeQuandoMs: Date.now() - inicio,
      });
      if (d.tipo === 'arrancar') return;
      await new Promise((r) => setTimeout(r, 500));
    }
  };

  // ---- 1) a faixa -----------------------------------------------------------
  //
  // Repara no que ESTE efeito depende: a faixa da sessão E a faixa local. Antes
  // só olhava para a da sessão e guardava a última que tinha aplicado -- e essa
  // memória era pegajosa de mais: se o convidado trocasse de música por sua
  // conta, o efeito via que já tinha aplicado aquela faixa e não fazia nada.
  // Ficava a ouvir outra coisa, sozinho, e a sessão nem dava por isso.
  useEffect(() => {
    if (!sessao || souAnfitriao()) return;
    const alvo = sessao.track;
    if (!alvo?.sourceId) return;

    const actual = usePlayer.getState().current;
    if (actual?.sourceId === alvo.sourceId) return;

    // Um toque numa música já vai para a fila sozinho (ver o `playTrack`), por
    // isso aqui só se traz a pessoa de volta ao que a sessão está a tocar --
    // para os casos que não passam por um toque, como a fila local a avançar.
    ultimaMandada.current = alvo.sourceId;
    // Uma faixa de cada vez: a fila partilhada vive no servidor e e quem manda
    // que a consome no fim de cada musica. Dar uma fila local ao convidado
    // punha-o a adivinhar o que vinha a seguir.
    void usePlayer.getState().playTrack(alvo, [alvo], false, true);
  }, [sessao?.track?.sourceId, sessao?.id, faixaLocalDoConvidado, souAnfitriao]);

  // ---- 2) pausa e retoma ----------------------------------------------------
  useEffect(() => {
    if (!sessao || souAnfitriao()) return;
    const p = usePlayer.getState();
    // Só se a faixa for mesmo a da sessão: mandar tocar enquanto ainda
    // descarregamos outra coisa é pedir para tocar o que não está cá.
    if (p.current?.sourceId !== sessao.track?.sourceId) return;
    if (sessao.aTocar === p.isPlaying) return;
    void p.togglePlay();
  }, [sessao?.aTocar, sessao?.track?.sourceId, sessao?.id, souAnfitriao]);

  // ---- 3) o alinhamento -----------------------------------------------------
  const saltouEm = useRef(0);
  const forasSeguidos = useRef(0);
  const saltosNestaFaixa = useRef(0);

  // Contagem a zero a cada faixa: a desistência é por música, não para sempre.
  useEffect(() => { saltosNestaFaixa.current = 0; }, [sessao?.track?.sourceId]);

  useEffect(() => {
    if (!sessao) return;
    saltouEm.current = 0;
    forasSeguidos.current = 0;
    const relogio = setInterval(() => {
      const p = usePlayer.getState();
      const s = useOuvirJuntos.getState();
      if (!s.sessao) return;

      // Ainda a assentar de um salto: a posição que se lê agora é anterior a
      // ele, e compará-la levaria a saltar outra vez.
      if (Date.now() - saltouEm.current < DESCANSO_APOS_SALTO_MS) return;

      // O anfitrião não se corrige a si próprio: ele É a referência.
      if (s.souAnfitriao()) {
        p._setCorrecaoDeSincronia(1);
        return;
      }

      const mesmaFaixa = p.current?.sourceId === s.sessao.track?.sourceId;
      const temFicheiro = !!p.current && cachedAudioFile(p.current.sourceId).exists;

      // A posição da store é de uma amostra anterior; entre amostras ela anda
      // sozinha. Sem isto comparávamos um valor velho com um fresco e
      // corrigíamos um desvio que era só o atraso da nossa própria leitura.
      const decorrido = p.isPlaying ? Date.now() - p.positionAt : 0;

      const correcao = correccaoNecessaria({
        posicaoLocalMs: p.positionMs + decorrido,
        posicaoDaSessaoMs: s.posicaoAgora(),
        aTocar: p.isPlaying && s.sessao.aTocar,
        pronta: mesmaFaixa && temFicheiro,
      });

      if (correcao.tipo === 'saltar') {
        // Confirma-se antes de cortar o som: uma leitura isolada fora do sítio
        // pode ser só um `timeUpdate` atrasado.
        forasSeguidos.current += 1;
        if (forasSeguidos.current < LEITURAS_PARA_SALTAR) return;
        forasSeguidos.current = 0;

        // Já se tentou o que havia a tentar nesta faixa. Insistir é o ciclo
        // descrito no `SALTOS_POR_FAIXA`: mais saltos, mais buffer, mais
        // atraso. Fica-se desencontrado e com o som inteiro.
        if (saltosNestaFaixa.current >= SALTOS_POR_FAIXA) {
          p._setCorrecaoDeSincronia(1);
          return;
        }
        saltosNestaFaixa.current += 1;
        saltouEm.current = Date.now();
        p._setCorrecaoDeSincronia(1);
        void p.seekTo(correcao.paraMs);
        return;
      }
      forasSeguidos.current = 0;
      p._setCorrecaoDeSincronia(velocidadeAAplicar(1, correcao));
    }, AFINACAO_MS);

    return () => {
      clearInterval(relogio);
      usePlayer.getState()._setCorrecaoDeSincronia(1);
    };
  }, [sessao?.id]);

  // ---- o outro lado: quem manda anuncia -------------------------------------
  //
  // Sem isto a sessão era um espelho vazio: o anfitrião trocava de música e mais
  // ninguém sabia. Anuncia-se a MUDANÇA e não o estado a toda a hora -- uma
  // escrita por faixa, não uma por segundo.
  const faixaLocal = usePlayer((s) => s.current?.sourceId);
  const aTocarLocal = usePlayer((s) => s.isPlaying);

  useEffect(() => {
    const s = useOuvirJuntos.getState();
    if (!s.sessao || !s.possoControlar()) return;
    const actual = usePlayer.getState().current;
    if (!actual?.sourceId || actual.sourceId === s.sessao.track?.sourceId) return;
    void s.anunciarFaixa(actual);
  }, [faixaLocal, sessao?.id]);

  useEffect(() => {
    const s = useOuvirJuntos.getState();
    if (!s.sessao || !s.possoControlar()) return;
    const p = usePlayer.getState();
    // Só se já estivermos na faixa da sessão: anunciar uma pausa enquanto ainda
    // se descarrega outra coisa parava a música a toda a gente sem razão.
    if (p.current?.sourceId !== s.sessao.track?.sourceId) return;
    if (p.isPlaying === s.sessao.aTocar) return;
    if (p.isPlaying) void s.anunciarRetoma();
    else void s.anunciarPausa(p.positionMs);
  }, [aTocarLocal, sessao?.id]);

  // ---- a fila partilhada manda no fim da faixa ------------------------------
  //
  // Registado e nao importado: a store do leitor continua a nao saber que o
  // ouvir-juntos existe, e sem sessao (ou sem permissao) isto e nulo e o fim
  // de faixa segue o caminho de sempre.
  //
  // So no FIM. Quem carrega em seguinte quer a musica seguinte DELE, nao a
  // sugestao de outra pessoa -- e uma fila partilhada que sequestrasse o botao
  // de saltar era uma fila que ninguem queria ligar.
  useEffect(() => {
    if (!sessao) { registarFimNaSessao(null); return; }
    registarFimNaSessao(async () => {
      const s = useOuvirJuntos.getState();
      if (!s.sessao || !s.possoControlar()) return false;
      const [primeira] = s.fila;
      if (!primeira) return false;
      // ESPERAR por quem ainda nao tem a faixa, ate ao tecto. Arrancar sem
      // isto punha o convidado a entrar a meio de TODAS as musicas -- e a
      // fila de downloads dele so deixa passar uma de cada vez.
      //
      // O tecto nao e opcional: sem ele, um amigo em 3G mau congela a sessao
      // inteira e ninguem percebe porque. Ver `lib/sessaoViva.ts`.
      await esperarPorTodos();
      const avancou = await s.avancarPelaFila();
      // Quem manda tambem toca: a sessao diz qual e a faixa, mas so os
      // convidados e que obedecem a sessao. Sem esta linha o anfitriao punha a
      // faixa a tocar para toda a gente menos para ele.
      if (avancou) void usePlayer.getState().playTrack(primeira.track, [primeira.track], false, true);
      return avancou;
    });
    return () => registarFimNaSessao(null);
  }, [sessao?.id]);

  // ---- e dizer aos outros se já temos a faixa -------------------------------
  useEffect(() => {
    if (!sessao?.track?.sourceId) return;
    const contar = () => {
      if (!appEstaVisivel()) return;
      const alvo = sessao.track?.sourceId;
      if (!alvo) return;
      const pronta = cachedAudioFile(alvo).exists;
      const pct = usePlayer.getState().downloadProgress;
      // Só se anuncia quando MUDA de facto, ou a percentagem enche o realtime
      // de toda a gente com uma escrita por segundo.
      const percentagem = Math.round((pct ?? (pronta ? 1 : 0)) * 100);
      if (ultimaProntidao.current === pronta && !(!pronta && pct != null)) return;
      ultimaProntidao.current = pronta;
      void anunciarProntidao(pronta, percentagem);
    };
    contar();
    const t = setInterval(contar, 3000);
    return () => clearInterval(t);
  }, [sessao?.track?.sourceId, sessao?.id, anunciarProntidao]);
}
