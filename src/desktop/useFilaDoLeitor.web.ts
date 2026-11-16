import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSeguirAmigo } from '../state/seguirAmigo';
import { esperaDaSaida, fimDaFila, inicioDoGrupoDaRadio } from '../lib/leitorDoPc';
import { trackKey } from '../lib/shuffle';
import { avisarErro, avisarRemocao, contarMusicas } from '../lib/avisoDeRemocao';
import { pertoDoFim } from '../lib/grelhaQueCresce';
import type { CommonPageProps } from './rotas';
import type { Track } from '../types';
import { addTracksToPlaylist, createPlaylist } from '../api/playlists';
import { faixasDaFila, nomeParaAFila } from '../lib/guardarFila';
import { fraseDeVoltar } from '../lib/origemDaFila';
import { mensagemDeErro } from '../lib/mensagemDeErro';

const LINHAS_DA_FILA = 100;

/** Quem pediu menos movimento não espera por uma saída que não vê. */
const calmo = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A mesma ordem e as mesmas ações no Now Playing e no painel lateral. */
export function useFilaDoLeitor({ more, notify }: Pick<CommonPageProps, 'more' | 'notify'>) {
  const current = usePlayer((s) => s.current);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const shuffle = usePlayer((s) => s.shuffle);
  const shuffleOrder = usePlayer((s) => s.shuffleOrder);
  const upcomingQueue = usePlayer((s) => s.upcomingQueue);
  const playTrack = usePlayer((s) => s.playTrack);
  const reordenarProximas = usePlayer((s) => s.reordenarProximas);
  const repeatMode = usePlayer((s) => s.repeatMode);
  const autoplayRadio = usePlayer((s) => s.autoplayRadio);
  const radioParado = usePlayer((s) => s.radioStopped);
  const radioErro = usePlayer((s) => s.radioError);
  const doRadio = usePlayer((s) => s.doRadio);
  const aPreparar = usePlayer((s) => s.radioMode === 'preparing');
  const radioLigado = usePlayer((s) => s.radioMode === 'on');
  const sessao = useOuvirJuntos((s) => s.sessao);
  const emJam = !!sessao;
  const podeLimparNaSala = useOuvirJuntos((s) => !!s.euId && s.possoControlar());
  const filaDaSessao = useOuvirJuntos((s) => s.fila);
  const seguido = useSeguirAmigo((s) => s.seguindo);
  const proximasDele = useSeguirAmigo((s) => s.aSeguir);
  const upNext = useMemo(
    () => seguido ? proximasDele.map((track, index) => ({ track, index }))
      : emJam ? filaDaSessao.map((i, index) => ({ track: i.track, index })) : upcomingQueue(),
    // A função da store é estável; estes campos invalidam a ordem que ela lê.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seguido, proximasDele, emJam, filaDaSessao, queue, queueIndex, shuffle, shuffleOrder, upcomingQueue],
  );
  // Uma biblioteca inteira não monta milhares de linhas arrastáveis de uma vez.
  const [linhasDaFila, setLinhasDaFila] = useState(LINHAS_DA_FILA);
  const [aConfirmarLimpar, setAConfirmarLimpar] = useState(false);
  useEffect(() => {
    if (!aConfirmarLimpar) return;
    const t = setTimeout(() => setAConfirmarLimpar(false), 4000);
    return () => clearTimeout(t);
  }, [aConfirmarLimpar]);
  const podeEditar = !emJam && !seguido;
  // A fila que se deixou ao começar outra (9/11): uma linha por baixo da cabeça
  // leva de volta, na música e no segundo onde se ia. Só na fila de cada um.
  const filaAnterior = usePlayer((s) => s.filaAnterior);
  const anterior = podeEditar && filaAnterior ? fraseDeVoltar(filaAnterior.origem, filaAnterior.faltam) : null;
  const podeLimpar = !seguido && (!emJam || podeLimparNaSala);
  useEffect(() => { setAConfirmarLimpar(false); }, [sessao?.id, podeLimpar, seguido]);
  // Limpar (30/10): as linhas saem em cascata e SÓ DEPOIS se tira da fila (a
  // store muda de uma vez e as linhas desapareciam sem ninguém as ver sair).
  // Com o Undo do aviso, como no iPhone.
  const [aLimpar, setALimpar] = useState(false);
  const limparTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (limparTimer.current) clearTimeout(limparTimer.current); }, []);
  const limpar = () => {
    if (!podeLimpar || !upNext.length || aLimpar) return;
    if (!aConfirmarLimpar) { setAConfirmarLimpar(true); return; }
    setAConfirmarLimpar(false);
    setALimpar(true);
    const sala = sessao?.id ?? null;
    limparTimer.current = setTimeout(async () => {
      limparTimer.current = null;
      try {
        const jam = useOuvirJuntos.getState();
        if ((jam.sessao?.id ?? null) !== sala || useSeguirAmigo.getState().seguindo) return;
        if (sala) { if (jam.euId && jam.possoControlar()) await jam.limparFila(sala); return; }
        const st = usePlayer.getState();
        if (st.queue !== queue) return; // outra lista começou durante a animação
        const foto = st.fotografiaDaFila();
        const sairam = st.limparProximas();
        if (sairam > 0) avisarRemocao({
          texto: `Cleared ${contarMusicas(sairam)}`,
          detalhe: 'from Up next',
          desfazer: () => { usePlayer.getState().reporFila(foto, { radio: true }); },
        });
      } catch (e) {
        avisarErro(mensagemDeErro(e, "Couldn't clear the queue."));
      } finally { setALimpar(false); }
    }, calmo() ? 0 : esperaDaSaida(Math.min(upNext.length, linhasDaFila)));
  };
  // A Radio a trocar a fila: enquanto procura, as linhas viram e saem; quando
  // a nova chega, entra a virar. Só na fila de cada um (num Jam ou a seguir um
  // amigo não é a tua fila que a Radio troca).
  const aVirar = aPreparar && podeEditar;
  const [novaDaRadio, setNovaDaRadio] = useState(false);
  const eraPreparar = useRef(false);
  const novaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (novaTimer.current) clearTimeout(novaTimer.current); }, []);
  useEffect(() => {
    if (eraPreparar.current && radioLigado && podeEditar) {
      setNovaDaRadio(true);
      if (novaTimer.current) clearTimeout(novaTimer.current);
      novaTimer.current = setTimeout(() => { novaTimer.current = null; setNovaDaRadio(false); }, 1500);
    }
    eraPreparar.current = aPreparar;
  }, [aPreparar, radioLigado, podeEditar]);
  // Onde começa o grupo da Radio (as que a Radio juntou, até ao fim da fila).
  const inicioDoGrupo = podeEditar
    ? inicioDoGrupoDaRadio(upNext.slice(0, linhasDaFila).map((u) => trackKey(u.track)), doRadio) : -1;
  // Guardar a fila como playlist (11/10), como no iPhone: a que toca e as
  // próximas, sem repetidas, com o nome sugerido pela origem.
  const [aGuardar, setAGuardar] = useState<{ nome: string } | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const pedirNome = () => setAGuardar({ nome: nomeParaAFila(usePlayer.getState().origemDaFila, new Date()) });
  const guardar = async (nome: string) => {
    const faixas = faixasDaFila(current, upNext.map((u) => u.track));
    if (!nome.trim() || !faixas.length || aGravar) return;
    setAGravar(true);
    try {
      const nova = await createPlaylist(nome.trim());
      await addTracksToPlaylist(nova.id, faixas);
      notify(`Saved “${nome.trim()}” · ${faixas.length} ${faixas.length === 1 ? 'song' : 'songs'}`);
      setAGuardar(null);
    } catch (e) {
      avisarErro(mensagemDeErro(e, "Couldn't save the queue."));
    } finally {
      setAGravar(false);
    }
  };
  // Escolher várias (16/11, lib/filaEmLote.ts): Ctrl (⌘) + clique marca uma,
  // Shift + clique marca de uma à outra, e um clique simples larga a escolha
  // (sem tocar, como nas tabelas). Esc também larga. Pelos índices REAIS da
  // fila: mexida a fila, a escolha recomeça.
  const [escolhidas, setEscolhidas] = useState<ReadonlySet<number>>(new Set());
  const ancora = useRef<number | null>(null);
  useEffect(() => { setEscolhidas(new Set()); ancora.current = null; }, [queue, queueIndex, shuffleOrder, emJam, seguido]);
  useEffect(() => {
    if (!escolhidas.size) return;
    const fugir = (e: KeyboardEvent) => { if (e.key === 'Escape') setEscolhidas(new Set()); };
    window.addEventListener('keydown', fugir);
    return () => window.removeEventListener('keydown', fugir);
  }, [escolhidas]);
  /** Um clique numa linha: devolve se foi da escolha (e então não toca). */
  const aoEscolher = (e: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }, visivel: number, real: number): boolean => {
    if (!podeEditar) return false;
    const ctrl = !!(e.ctrlKey || e.metaKey);
    if (!ctrl && !e.shiftKey) {
      if (!escolhidas.size) return false;
      setEscolhidas(new Set());
      return true;
    }
    const novo = new Set(escolhidas);
    if (e.shiftKey && ancora.current != null) {
      const [a, b] = ancora.current < visivel ? [ancora.current, visivel] : [visivel, ancora.current];
      for (let i = a; i <= b; i++) { const u = upNext[i]; if (u) novo.add(u.index); }
    } else {
      if (novo.has(real)) novo.delete(real); else novo.add(real);
      ancora.current = visivel;
    }
    setEscolhidas(novo);
    return true;
  };
  const comDesfazer = (acao: () => number, texto: (n: number) => string, detalhe?: string) => {
    const foto = usePlayer.getState().fotografiaDaFila();
    const n = acao();
    if (n > 0) avisarRemocao({ tipo: 'feito', texto: texto(n), detalhe, desfazer: () => { usePlayer.getState().reporFila(foto); } });
    setEscolhidas(new Set());
    return n;
  };
  const baralhar = () => comDesfazer(() => usePlayer.getState().baralharProximas(), () => 'Shuffled Up next');
  const porASeguir = () => comDesfazer(() => usePlayer.getState().porVariasASeguir([...escolhidas]), () => 'Playing next', contarMusicas(escolhidas.size));
  const tirarEscolhidas = () => comDesfazer(() => usePlayer.getState().tirarVarias([...escolhidas]), (n) => `Removed ${contarMusicas(n)}`, 'from Up next');

  const aoRolar = (e: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (upNext.length > linhasDaFila && pertoDoFim(contentOffset.y, layoutMeasurement.height, contentSize.height)) {
      setLinhasDaFila((n) => n + LINHAS_DA_FILA);
    }
  };
  return {
    current, upNext, emJam, seguido, podeEditar, podeLimpar, radioErro,
    linhasDaFila, aConfirmarLimpar, limpar, aoRolar,
    /** O que as linhas fazem agora: 'limpar' (saem em cascata), 'vira' (a Radio a trocar), ou nada. */
    saida: (aLimpar ? 'limpar' : aVirar ? 'vira' : null) as 'limpar' | 'vira' | null,
    /** A fila que a Radio acabou de trazer entra a virar. */
    entrada: (novaDaRadio ? 'vira' : null) as 'vira' | null,
    inicioDoGrupo, aLimpar,
    escolhidas, aoEscolher, largarEscolhidas: () => setEscolhidas(new Set()), baralhar, porASeguir, tirarEscolhidas,
    aGuardar, setAGuardar, pedirNome, guardar, aGravar,
    anterior, voltar: () => { usePlayer.getState().voltarAFilaAnterior(); },
    notaDoFim: fimDaFila({ emJam: emJam || !!seguido, repeatMode, autoplayRadio: autoplayRadio && !radioParado, vazia: !upNext.length }),
    aoTocar: (t: Track) => { if (!seguido) void playTrack(t, queue); },
    aoMenu: (t: Track, indiceReal: number) => emJam || seguido ? more(t) : more(t, undefined, { fila: indiceReal }),
    aoMover: (de: number, para: number) => { if (podeEditar) reordenarProximas(de, para); },
  };
}
