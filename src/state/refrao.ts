import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { pontoDoRefrao, refraoDaMusica } from '../api/refrao';
import { getRefraoNaBarra, setRefraoNaBarra } from '../lib/prefs';
import { ABAFO, PRE_ESCUTA_S } from '../lib/refrao';
import type { Track } from '../types';
import { usePlayer } from './player';

/**
 * O refrão primeiro (25/10, `lib/refrao.ts`): a pré-escuta que está a soar.
 *
 * Uma de cada vez. Carregar no auscultador de outra troca; no da mesma, pára.
 * Quem toca é o leitor da pré-escuta de cada plataforma, que diz quando já há
 * som (`refraoComecou`): os 15 s contam daí, por um prazo absoluto, e é daí
 * que a música que estava a tocar fica mais baixa por baixo (`abafoDoRefrao`).
 * Mexer na música de sempre (outra faixa, ou play depois de uma pausa) acaba
 * com a pré-escuta: quem escolheu ouvir, escolheu.
 */
type EstadoDoRefrao = {
  /** A música em pré-escuta, ou `null`. */
  faixa: Track | null;
  /** Onde começa, em segundos; `null` enquanto se procura. */
  inicioS: number | null;
  /** Quando acaba (ms, relógio da parede), desde que se ouve; `null` antes. */
  ate: number | null;
};

export const useRefrao = create<EstadoDoRefrao>(() => ({ faixa: null, inicioS: null, ate: null }));

/** Só as músicas do YouTube têm a curva e o leitor da pré-escuta. */
export const temRefrao = (t: Track | null | undefined): t is Track => !!t && t.source === 'youtube' && !!t.sourceId;

let vez = 0;
let fim: ReturnType<typeof setTimeout> | undefined;

/** Carregar no auscultador: começa a pré-escuta desta música, ou pára-a se já for ela. */
export function ouvirRefrao(track: Track): void {
  if (!temRefrao(track)) return;
  if (useRefrao.getState().faixa?.sourceId === track.sourceId) { pararRefrao(); return; }
  pararRefrao();
  const minha = vez;
  useRefrao.setState({ faixa: track, inicioS: null, ate: null });
  vigiarOLeitor();
  void pontoDoRefrao(track.sourceId, track.durationSeconds).then((inicioS) => {
    if (minha === vez) useRefrao.setState({ inicioS });
  });
}

/** O leitor da pré-escuta já dá som: os 15 s contam daqui, e a outra baixa. */
export function refraoComecou(): void {
  const st = useRefrao.getState();
  if (!st.faixa || st.ate != null) return;
  const ate = Date.now() + PRE_ESCUTA_S * 1000;
  useRefrao.setState({ ate });
  clearTimeout(fim);
  fim = setTimeout(pararRefrao, Math.max(0, ate - Date.now()));
  rampa(ABAFO);
}

/** Acaba a pré-escuta (o fim dos 15 s, o mesmo auscultador, ou a música de sempre a mexer). */
export function pararRefrao(): void {
  vez++;
  clearTimeout(fim);
  largarOLeitor?.();
  largarOLeitor = null;
  if (useRefrao.getState().faixa) useRefrao.setState({ faixa: null, inicioS: null, ate: null });
  if (abafo !== 1 || alvo !== 1) rampa(1);
}

// --- O abafo da música que estava a tocar --------------------------------

/** Quanto dura a descida e a subida: sem degrau, e sem esconder o começo do refrão. */
const RAMPA_MS = 300;
let abafo = 1;
let alvo = 1;
let passo: ReturnType<typeof setTimeout> | undefined;
const aplicadores = new Set<() => void>();

/**
 * O fator do volume da música de sempre (1, ou `ABAFO` com a pré-escuta a
 * soar). Cada leitor multiplica o volume que já ia pôr por isto, e regista-se
 * em `seguirOAbafo` para o voltar a pôr quando muda.
 */
export function abafoDoRefrao(): number {
  return abafo;
}

export function seguirOAbafo(aplicar: () => void): () => void {
  aplicadores.add(aplicar);
  return () => { aplicadores.delete(aplicar); };
}

function aplicar() {
  for (const f of aplicadores) {
    try { f(); } catch {}
  }
}

/** Do abafo de agora ao `para`, em `RAMPA_MS`, por um relógio absoluto. */
function rampa(para: number) {
  clearTimeout(passo);
  alvo = para;
  const de = abafo;
  const inicio = Date.now();
  const andar = () => {
    const t = Math.min(1, (Date.now() - inicio) / RAMPA_MS);
    abafo = t >= 1 ? para : de + (para - de) * t;
    aplicar();
    if (t < 1) passo = setTimeout(andar, 40);
  };
  andar();
}

// --- A música de sempre a mexer acaba com a pré-escuta -------------------

let largarOLeitor: (() => void) | null = null;

function vigiarOLeitor() {
  largarOLeitor?.();
  const antes = usePlayer.getState();
  let faixa = antes.current?.sourceId ?? null;
  let tocava = antes.isPlaying;
  largarOLeitor = usePlayer.subscribe((s) => {
    const agora = s.current?.sourceId ?? null;
    const outra = agora !== faixa;
    const voltouATocar = s.isPlaying && !tocava;
    faixa = agora;
    tocava = s.isPlaying;
    if (outra || voltouATocar) pararRefrao();
  });
}

// --- A risca do refrão na barra do leitor --------------------------------

/**
 * A opção "Chorus on the progress bar" (25/10, desligada de origem): com ela,
 * a barra do leitor do PC e a do Now Playing do iPhone mostram uma risca fina
 * onde o refrão começa. Lida do disco à primeira vez que uma barra pergunta.
 */
export const useMarcaDoRefrao = create<{ ligada: boolean }>(() => ({ ligada: false }));
let marcaLida = false;

/** Lê a opção do disco, uma vez (a barra e as Definições chamam isto ao montar). */
export function lerMarcaDoRefrao(): void {
  if (marcaLida) return;
  marcaLida = true;
  void getRefraoNaBarra().then((l) => useMarcaDoRefrao.setState({ ligada: l })).catch(() => {});
}

export function ligarMarcaDoRefrao(ligada: boolean): void {
  marcaLida = true;
  useMarcaDoRefrao.setState({ ligada });
  void setRefraoNaBarra(ligada);
}

/**
 * Onde fica a risca na música que toca, em segundos, ou `null`. Só com a
 * opção ligada e a barra à vista, e só da curva: uma risca adivinhada numa
 * barra diria uma coisa que não se sabe. Um pedido por música nova, guardado.
 */
export function usePontoNaBarra(track: Track | null, aVista: boolean): number | null {
  const ligada = useMarcaDoRefrao((s) => s.ligada);
  const [ponto, setPonto] = useState<{ id: string; inicioS: number } | null>(null);
  useEffect(lerMarcaDoRefrao, []);
  const id = temRefrao(track) ? track.sourceId : null;
  const duracaoS = track?.durationSeconds ?? null;
  useEffect(() => {
    if (!ligada || !aVista || !id || ponto?.id === id) return;
    let viva = true;
    void refraoDaMusica(id, duracaoS).then((r) => {
      if (viva && r.daCurva) setPonto({ id, inicioS: r.inicioS });
    });
    return () => { viva = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ligada, aVista, id, duracaoS]);
  return ligada && id && ponto?.id === id ? ponto.inicioS : null;
}
