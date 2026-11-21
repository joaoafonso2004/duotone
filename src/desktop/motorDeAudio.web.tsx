/**
 * O motor só de áudio do PC (F4 do plano do Tauri, `.claude/planos/PLANO-TAURI.md`).
 * SÓ na casca Tauri (decidido pelo João a 21/11): no Electron não há
 * `duotoneDesktop.registarAudio`, e o `MotorDoPc` é exatamente o
 * `YouTubePlayerView` de sempre.
 *
 * Como toca: o resolvedor do iPhone (`ytstream.ts`, com o `fetch` pelo Rust)
 * dá o URL do ficheiro de áudio; a casca regista-o e serve-o em `/audio/<id>`
 * (desktop/src/audio.rs), aos bocados e à medida que chega; um `<audio>` da
 * página toca-o, passando pelo grafo do EQ de sempre. Sem vídeo, sem iframe.
 * Medido nas provas de 21/11: metade da memória do IFrame e o som mais cedo.
 *
 * O mesmo contrato com a store que o `YouTubePlayerView.web.tsx`:
 * `registerYtControls`, `_setProgress`, `_setBuffering`, `_setActiveBackend`,
 * `_onYtStateChange` e `setError`. O que este motor ainda não faz (crossfade,
 * Jam, seguir um amigo) continua no IFrame: o `MotorDoPc` escolhe por faixa, e
 * uma falha (resolução, HLS, erro do `<audio>`) passa ESSA faixa ao IFrame.
 */
import React, { useEffect, useRef, useState } from 'react';
import { aquecerResolvedor, definirFetchDoYouTube, definirSondaDaCascata, resolveYouTubeStream } from '../api/ytstream';
import { YouTubePlayerView } from '../components/YouTubePlayerView';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSeguirAmigo } from '../state/seguirAmigo';
import { volumeParaOMotor } from '../lib/curvaDoVolume';
import { abafoDoRefrao } from '../state/refrao';
import { registarNaFila } from '../lib/playbackDiagnostics';
import type { Track } from '../types';

const ponte = (): any => (typeof window !== 'undefined' ? (window as any).duotoneDesktop : undefined);

/** Há motor só de áudio nesta casca? (`localStorage['duotone:motor'] = 'iframe'` desliga-o.) */
export function haMotorSoDeAudio(): boolean {
  let desligado = false;
  try { desligado = localStorage.getItem('duotone:motor') === 'iframe'; } catch { /* sem armazenamento: fica ligado */ }
  return !!ponte()?.registarAudio && !desligado;
}

// ------------------------------------------------------------------ o fetch
// O InnerTube e o googlevideo recusam a página (CORS): o resolvedor passa pelo Rust.
let fetchLigado = false;
function ligarOFetch(): void {
  if (fetchLigado) return;
  fetchLigado = true;
  // Sem a sonda de 2 bytes: um URL morto dá erro no `<audio>` e a faixa vai pelo IFrame.
  definirSondaDaCascata(false);
  definirFetchDoYouTube(async (url, init) => {
    const p = ponte();
    const u = String(url);
    const cabecalhos = new Headers((init?.headers ?? {}) as HeadersInit);
    if (p?.pedirAoInnerTube && /^https:\/\/www\.youtube\.com\/youtubei\/v1\/(player|visitor_id)\b/.test(u)) {
      const pares: [string, string][] = [];
      cabecalhos.forEach((v, k) => pares.push([k, v]));
      const r = await p.pedirAoInnerTube(u, String(init?.body ?? ''), pares);
      return new Response(r.corpo, { status: r.status });
    }
    if (p?.sondarAudio && /^https:\/\/[^/]+\.googlevideo\.com\//.test(u) && cabecalhos.get('Range') === 'bytes=0-1') {
      const estado = Number(await p.sondarAudio(u));
      if (!estado) throw new TypeError('Failed to fetch');
      return new Response(null, { status: estado });
    }
    return fetch(url, init);
  });
}

/**
 * A primeira música deixa de pagar o arranque (medido a 21/11: 1 434 ms contra
 * ~620 nas seguintes). Uma vez, depois da abertura (`useAquecerResolvedor.web`):
 * o `visitorData` (disco ou rede) e a ligação da casca ao www.youtube.com já
 * aberta, que é por onde passa o `/player` do clique. Se falhar, a música faz o
 * que sempre fez.
 */
export async function aquecerOMotor(): Promise<void> {
  if (!haMotorSoDeAudio()) return;
  ligarOFetch();
  await aquecerResolvedor();
  try { await ponte()?.aquecerLigacoes?.(); } catch { /* uma conveniência */ }
}

// ------------------------------------------------------------------ o grafo
// UM `<audio>` e UM grafo para a vida da página: o `createMediaElementSource`
// só pode ser chamado uma vez por elemento. É o grafo do `EQ_INSTALAR` do main.cjs.
type Grafo = { ctx: AudioContext; audio: HTMLAudioElement; filtros: BiquadFilterNode[]; margem: GainNode; limitador: DynamicsCompressorNode };
let grafo: Grafo | null = null;
function oGrafo(): Grafo {
  if (grafo) return grafo;
  const ctx = new AudioContext();
  const audio = new Audio();
  audio.preload = 'auto';
  // O tom acompanha a velocidade (o "slowed" soa a fita mais lenta, não a time-stretch).
  (audio as any).preservesPitch = false;
  const fonte = ctx.createMediaElementSource(audio);
  const bandas = [105, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 10000];
  const tipos: BiquadFilterType[] = ['lowshelf', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'];
  let no: AudioNode = fonte;
  const filtros = bandas.map((f, i) => {
    const b = ctx.createBiquadFilter();
    b.type = tipos[i]; b.frequency.value = f; b.Q.value = 1; b.gain.value = 0;
    no.connect(b); no = b;
    return b;
  });
  const margem = ctx.createGain();
  margem.gain.value = 1;
  const limitador = ctx.createDynamicsCompressor();
  limitador.threshold.value = -0.1; limitador.knee.value = 0; limitador.ratio.value = 1;
  limitador.attack.value = 0.003; limitador.release.value = 0.15;
  no.connect(margem); margem.connect(limitador); limitador.connect(ctx.destination);
  grafo = { ctx, audio, filtros, margem, limitador };
  // A ponte (ponte.js) manda o EQ e o tom para aqui.
  (window as any).__duotoneMotor = {
    aplicarEqualizador: async (ajuste: any) => {
      const g = grafo!;
      try { await g.ctx.resume(); } catch { /* sem gesto ainda */ }
      const ganhos: number[] = Array.isArray(ajuste) ? ajuste : (ajuste?.ganhos ?? []);
      const comp = Number(Array.isArray(ajuste) ? 1 : ajuste?.compensacao);
      const t = g.ctx.currentTime;
      g.filtros.forEach((f, i) => f.gain.setTargetAtTime(Number(ganhos[i]) || 0, t, 0.02));
      g.margem.gain.setTargetAtTime(Number.isFinite(comp) && comp > 0 && comp <= 1 ? comp : 1, t, 0.02);
      const ativo = ganhos.some((v) => Math.abs(Number(v) || 0) >= 0.05);
      g.limitador.ratio.setTargetAtTime(ativo ? 20 : 1, t, 0.02);
      return { ok: true, margem: comp };
    },
    naoEsticarOTempo: async () => {
      (grafo!.audio as any).preservesPitch = false;
      return { ok: true, agora: false, rate: grafo!.audio.playbackRate };
    },
  };
  return grafo;
}

/** Uma linha no registo da casca (`%LOCALAPPDATA%\<id>\logs\duotone.log`): as medidas do motor. */
function registarNaCasca(texto: string): void {
  try { (window as any).__TAURI_INTERNALS__?.invoke('registo_da_pagina', { texto }); } catch { /* sem casca */ }
}
/** Do pedido de uma faixa ao primeiro "playing": a medida que se compara com a régua (566/1 099 ms). */
let marca: { id: string; t0: number; origem: 'cache' | 'rede' | '?'; resolvido: number | null } | null = null;

const volumeDoMotor = (vol: number): number => {
  const v = volumeParaOMotor(vol);
  return (v > 0 ? Math.max(1, Math.round(v * abafoDoRefrao())) : 0) / 100;
};

/** O motor de uma faixa. `aoFalhar` passa-a ao IFrame. */
function MotorDeAudio({ track, aoFalhar }: { track: Track; aoFalhar: (sourceId: string, porque: string) => void }) {
  const faixaRef = useRef(track);
  faixaRef.current = track;
  const aCarregarRef = useRef(false);
  const ultimoProgressoRef = useRef(0);

  // Os eventos do `<audio>` e os controlos: uma vez por montagem.
  useEffect(() => {
    ligarOFetch();
    const g = oGrafo();
    const a = g.audio;
    const st = usePlayer.getState();
    st.registerYtControls({
      play: () => { void g.ctx.resume(); a.play().catch(() => {}); },
      pause: () => a.pause(),
      seek: (ms: number) => { try { a.currentTime = ms / 1000; } catch { /* sem metadados ainda */ } },
      setVolume: (vol: number) => { a.volume = volumeDoMotor(vol); },
    });
    const progresso = (forcar = false) => {
      const agora = Date.now();
      if (!forcar && agora - ultimoProgressoRef.current < (document.hidden ? 5000 : 1000)) return;
      ultimoProgressoRef.current = agora;
      const duracao = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : (faixaRef.current.durationSeconds || 0);
      usePlayer.getState()._setProgress(a.currentTime * 1000, duracao * 1000);
    };
    const aoTocar = () => {
      const m = marca;
      if (m && m.id === faixaRef.current.sourceId) {
        marca = null;
        registarNaCasca(`motor: ${m.id} som aos ${Math.round(performance.now() - m.t0)} ms (${m.origem}${m.resolvido != null ? `, resolver ${m.resolvido} ms` : ''})`);
      }
      aCarregarRef.current = false;
      const s = usePlayer.getState();
      s.setError(null); s._setBuffering(false); s._setActiveBackend('native'); s._onYtStateChange('playing');
      progresso(true);
    };
    const aoPausar = () => { if (!aCarregarRef.current && !a.ended) usePlayer.getState()._onYtStateChange('paused'); progresso(true); };
    const aoAcabar = () => usePlayer.getState()._onYtStateChange('ended');
    const aoEsperar = () => usePlayer.getState()._setBuffering(true);
    const aoTempo = () => progresso();
    const aoErro = () => {
      if (!a.src) return;
      const codigo = a.error?.code ?? 0;
      aoFalhar(faixaRef.current.sourceId, `audio error ${codigo}`);
    };
    a.addEventListener('playing', aoTocar);
    a.addEventListener('pause', aoPausar);
    a.addEventListener('ended', aoAcabar);
    a.addEventListener('waiting', aoEsperar);
    a.addEventListener('timeupdate', aoTempo);
    a.addEventListener('error', aoErro);
    return () => {
      a.removeEventListener('playing', aoTocar);
      a.removeEventListener('pause', aoPausar);
      a.removeEventListener('ended', aoAcabar);
      a.removeEventListener('waiting', aoEsperar);
      a.removeEventListener('timeupdate', aoTempo);
      a.removeEventListener('error', aoErro);
      // O motor sai (o IFrame vai tocar esta faixa, ou a casca desmontou): cala-se.
      aCarregarRef.current = true;
      a.pause();
      a.removeAttribute('src');
      a.load();
    };
  }, [aoFalhar]);

  // Trocar de faixa: da cache se lá estiver; senão resolve, regista e toca.
  useEffect(() => {
    let cancelado = false;
    const g = oGrafo();
    const a = g.audio;
    const st = usePlayer.getState();
    aCarregarRef.current = true;
    st._setBuffering(true);
    st._setActiveBackend('resolving');
    (async () => {
      const p = ponte();
      const id = track.sourceId;
      const t0 = performance.now();
      marca = { id, t0, origem: '?', resolvido: null };
      let caminho: string | null = null;
      try { caminho = (await p.audioNaCache(id))?.caminho ?? null; } catch { caminho = null; }
      if (caminho && marca?.id === id) marca.origem = 'cache';
      if (!caminho) {
        const s = await resolveYouTubeStream(id, 'high', false, 'opus');
        if (marca?.id === id) { marca.origem = 'rede'; marca.resolvido = Math.round(performance.now() - t0); }
        if (s.isHls || !s.contentLength) throw new Error('sem ficheiro de áudio (HLS)');
        const mime = s.formato === 'opus' ? 'audio/webm; codecs="opus"' : 'audio/mp4; codecs="mp4a.40.2"';
        caminho = String(await p.registarAudio(id, s.url, s.contentLength, mime));
      }
      if (cancelado) return;
      const agora = usePlayer.getState();
      a.src = caminho;
      a.playbackRate = agora.playbackRate || 1;
      (a as any).preservesPitch = false;
      a.volume = volumeDoMotor(agora.volume);
      // Uma posição guardada (o arranque da app, o "Continue here") retoma-se.
      const inicio = agora.positionMs > 1500 && agora.current?.sourceId === id ? agora.positionMs / 1000 : 0;
      if (inicio > 0) a.addEventListener('loadedmetadata', () => { try { a.currentTime = inicio; } catch { /* fica no início */ } }, { once: true });
      if (agora.isPlaying || agora.autoplayOnLoad) {
        try { await g.ctx.resume(); } catch { /* sem gesto ainda */ }
        await a.play();
      } else {
        aCarregarRef.current = false;
        st._setBuffering(false);
      }
    })().catch((e: unknown) => {
      if (cancelado) return;
      // Só para o diagnóstico (registarNaFila): a pessoa não vê isto, a faixa toca pelo IFrame.
      aoFalhar(track.sourceId, String(e));
    });
    return () => { cancelado = true; };
  }, [track.sourceId, aoFalhar]);

  // A velocidade escolhida (fora de Jam e sem seguir ninguém: esses vão para o IFrame).
  const velocidade = usePlayer((s) => s.playbackRate);
  useEffect(() => {
    const g = oGrafo();
    g.audio.playbackRate = velocidade || 1;
    (g.audio as any).preservesPitch = false;
  }, [velocidade]);

  return null;
}

/**
 * Que motor toca esta faixa. O só de áudio, salvo:
 * - num Jam, a seguir um amigo ou com crossfade (ainda só o IFrame os sabe fazer);
 * - numa faixa em que ele já falhou nesta sessão (vai pelo IFrame, como hoje).
 */
function MotorDoPcTauri({ track }: { track: Track }) {
  const emJam = useOuvirJuntos((s) => !!s.sessao);
  const aSeguir = useSeguirAmigo((s) => s.ritmo != null);
  const crossfade = usePlayer((s) => (s.crossfadeSegundos ?? 0) > 0);
  const [recurso, setRecurso] = useState<ReadonlySet<string>>(() => new Set());
  const aoFalhar = React.useCallback((sourceId: string, porque: string) => {
    registarNaFila(`${sourceId}: motor só de áudio falhou (${porque}); toca pelo IFrame`);
    registarNaCasca(`motor: ${sourceId} FALHOU (${porque}), vai pelo IFrame`);
    setRecurso((antes) => (antes.has(sourceId) ? antes : new Set(antes).add(sourceId)));
  }, []);
  const soDeAudio = !emJam && !aSeguir && !crossfade && !recurso.has(track.sourceId);
  return soDeAudio ? <MotorDeAudio track={track} aoFalhar={aoFalhar} /> : <YouTubePlayerView track={track} />;
}

/** O motor do PC: no Electron é o `YouTubePlayerView` de sempre, sem mais nada. */
export const MotorDoPc: (props: { track: Track }) => React.ReactElement | null = haMotorSoDeAudio() ? MotorDoPcTauri : YouTubePlayerView;
