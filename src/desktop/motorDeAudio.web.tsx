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
 * `_onYtStateChange` e `setError`. O crossfade é dele desde 21/11 (duas vozes,
 * ver `MotorDeAudio`). O que ainda não faz (Jam, seguir um amigo) continua no
 * IFrame: o `MotorDoPc` escolhe por faixa, e uma falha (resolução, HLS, erro do
 * `<audio>`) passa ESSA faixa ao IFrame.
 */
import React, { useEffect, useRef, useState } from 'react';
import { aquecerResolvedor, criarRenovacao, definirFetchDoYouTube, definirSondaDaCascata, resolveYouTubeStream } from '../api/ytstream';
import { YouTubePlayerView } from '../components/YouTubePlayerView';
import { usePlayer } from '../state/player';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useSeguirAmigo } from '../state/seguirAmigo';
import { volumeParaOMotor } from '../lib/curvaDoVolume';
import { abafoDoRefrao } from '../state/refrao';
import { registarNaFila } from '../lib/playbackDiagnostics';
import {
  ANTECEDENCIA_DO_PC_S, decorridoDaPassagem, deveComecarCrossfade, devePrepararSeguinte, podeCrossfade, seguemNoMesmoDisco,
  volumesDoCrossfade, type ContextoDoCrossfade,
} from '../lib/crossfade';
import { anunciarPassagem, desfazerPassagem } from '../state/passagemAVista';
import { aoTocar as ajusteAoTocar, chaveDaFaixa } from '../lib/equalizer';
import { arredondar as arredondarRate } from '../lib/playbackRate';
import { anotarPrimeiroSom } from '../state/tempoAteAoSom';
import { primeiraNota } from '../lib/tocarEnquantoDescarrega';
import { registar as registarEvento } from '../lib/eventos';
import { tituloDaFaixa } from '../lib/artistName';
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
  ligarResolverComORato();
  await aquecerResolvedor();
  try { await ponte()?.aquecerLigacoes?.(); } catch { /* uma conveniência */ }
}

// ------------------------------------------------------------- o rato parado
/**
 * Resolver antes do clique (o desenho do plano: "a linha com o rato parado").
 * A resolução é a maior parte do tempo até ao som numa música nova (352 a 904
 * ms a 21/11); com o rato parado em cima de uma linha ou de um cartão
 * (`data-yt`, ver `faixaDoRato` no ui.web.tsx), resolve-se já, e o clique
 * encontra o endereço na memória do `ytstream.ts`.
 * - Só com o rato PARADO (`RATO_PARADO_MS`): passar por cima de uma lista não pede nada.
 * - Nunca a que toca, nem uma que já está inteira no disco, e cada uma uma vez por sessão.
 * - Um teto por minuto: em casa o PC e o iPhone partilham o IP (o bloqueio de 16/10).
 */
const RATO_PARADO_MS = 250;
const RESOLUCOES_DO_RATO_POR_MINUTO = 4;
let ratoLigado = false;
function ligarResolverComORato(): void {
  if (ratoLigado || typeof document === 'undefined') return;
  ratoLigado = true;
  let alvo: string | null = null;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const feitas: number[] = [];
  const vistos = new Set<string>();
  document.addEventListener('pointerover', (ev) => {
    const el = (ev.target as Element | null)?.closest?.('[data-yt]');
    const id = el?.getAttribute('data-yt') ?? null;
    if (id === alvo) return;
    alvo = id;
    clearTimeout(temporizador);
    if (!id || vistos.has(id) || id === usePlayer.getState().current?.sourceId) return;
    temporizador = setTimeout(() => {
      if (alvo !== id || document.hidden) return;
      const agora = Date.now();
      while (feitas.length && agora - feitas[0] > 60_000) feitas.shift();
      if (feitas.length >= RESOLUCOES_DO_RATO_POR_MINUTO) return;
      vistos.add(id);
      if (vistos.size > 300) vistos.delete(vistos.values().next().value as string);
      void (async () => {
        try { if (await ponte()?.audioNaCache?.(id)) return; } catch { /* sem casca: resolve na mesma */ }
        feitas.push(Date.now());
        const t0 = performance.now();
        await resolveYouTubeStream(id, 'high', false, 'opus');
        registarNaCasca(`motor: ${id} resolvido com o rato parado em ${Math.round(performance.now() - t0)} ms`);
      })().catch(() => { /* o clique resolve como sempre */ });
    }, RATO_PARADO_MS);
  }, { passive: true });
}

// ------------------------------------------------------------------ o grafo
// DUAS vozes (dois `<audio>`, cada uma com o seu fader) e UM grafo para a vida da
// página: o `createMediaElementSource` só pode ser chamado uma vez por elemento.
// Os faders entram no grafo do `EQ_INSTALAR` do main.cjs. A voz ATIVA é a que
// fala com a loja; a outra prepara a seguinte para o crossfade.
type Voz = { audio: HTMLAudioElement; fader: GainNode; id: string | null };
type Grafo = {
  ctx: AudioContext; vozes: [Voz, Voz]; ativa: 0 | 1; filtros: BiquadFilterNode[]; margem: GainNode; limitador: DynamicsCompressorNode;
  /** A saída para o glitch, criada no primeiro pedido (`fluxoDoSom`). */
  destino?: MediaStreamAudioDestinationNode;
};
let grafo: Grafo | null = null;
function oGrafo(): Grafo {
  if (grafo) return grafo;
  const ctx = new AudioContext();
  const bandas = [105, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 10000];
  const tipos: BiquadFilterType[] = ['lowshelf', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'];
  const filtros = bandas.map((f, i) => {
    const b = ctx.createBiquadFilter();
    b.type = tipos[i]; b.frequency.value = f; b.Q.value = 1; b.gain.value = 0;
    return b;
  });
  filtros.reduce((antes, b) => { antes.connect(b); return b; });
  const margem = ctx.createGain();
  margem.gain.value = 1;
  const limitador = ctx.createDynamicsCompressor();
  limitador.threshold.value = -0.1; limitador.knee.value = 0; limitador.ratio.value = 1;
  limitador.attack.value = 0.003; limitador.release.value = 0.15;
  filtros[filtros.length - 1].connect(margem); margem.connect(limitador); limitador.connect(ctx.destination);
  const voz = (ganho: number): Voz => {
    const audio = new Audio();
    audio.preload = 'auto';
    // O tom acompanha a velocidade (o "slowed" soa a fita mais lenta, não a time-stretch).
    (audio as any).preservesPitch = false;
    const fader = ctx.createGain();
    fader.gain.value = ganho;
    ctx.createMediaElementSource(audio).connect(fader);
    fader.connect(filtros[0]);
    return { audio, fader, id: null };
  };
  grafo = { ctx, vozes: [voz(1), voz(0)], ativa: 0, filtros, margem, limitador };
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
      for (const v of grafo!.vozes) (v.audio as any).preservesPitch = false;
      return { ok: true, agora: false, rate: ativa(grafo!).audio.playbackRate };
    },
    /**
     * O som do motor para o glitch (`glitch/beat.web.ts`), em vez da captura do
     * ecrã do Electron, que o Tauri não tem: o que sai do limitador, já com o EQ.
     * O nó só nasce no primeiro pedido, e cada pedido leva uma CÓPIA da pista:
     * o glitch para-a ao sair, e a original continua para o pedido seguinte.
     */
    fluxoDoSom: (): MediaStream => {
      const g = grafo!;
      if (!g.destino) {
        g.destino = g.ctx.createMediaStreamDestination();
        g.limitador.connect(g.destino);
      }
      return g.destino.stream.clone();
    },
  };
  return grafo;
}
const ativa = (g: Grafo): Voz => g.vozes[g.ativa];
const emEspera = (g: Grafo): Voz => g.vozes[g.ativa === 0 ? 1 : 0];

/** O fader de uma voz num valor, já, sem nada agendado. */
function faderEm(g: Grafo, v: Voz, valor: number): void {
  const t = g.ctx.currentTime;
  v.fader.gain.cancelScheduledValues(t);
  v.fader.gain.setValueAtTime(valor, t);
}

/** Cala uma voz e larga o que tinha carregado (a memória e a ligação ao googlevideo). */
function largarVoz(g: Grafo, v: Voz): void {
  faderEm(g, v, 0);
  v.id = null;
  try { v.audio.pause(); } catch { /* já parada */ }
  if (v.audio.getAttribute('src')) {
    v.audio.removeAttribute('src');
    try { v.audio.load(); } catch { /* nada carregado */ }
  }
}

/**
 * A passagem agendada no relógio do áudio (o desenho do plano): a curva de igual
 * potência do `lib/crossfade.ts`, do ponto onde a passagem vai até ao fim. Sem
 * temporizadores a degraus, e o mesmo com a janela escondida. `velocidade`: a da
 * que sai, porque o fade conta-se em segundos de MÚSICA.
 */
const PONTOS_DA_CURVA = 64;
function agendarPassagem(g: Grafo, decorrido: number, fade: number, velocidade: number): void {
  const x0 = Math.min(1, Math.max(0, decorrido / fade));
  const segundos = Math.max(0.05, (fade - Math.max(0, decorrido)) / Math.max(0.25, velocidade));
  const sai = new Float32Array(PONTOS_DA_CURVA);
  const entra = new Float32Array(PONTOS_DA_CURVA);
  for (let i = 0; i < PONTOS_DA_CURVA; i++) {
    const x = x0 + (1 - x0) * (i / (PONTOS_DA_CURVA - 1));
    const v = volumesDoCrossfade(x * fade, fade, 1, 1);
    sai[i] = v.sai;
    entra[i] = v.entra;
  }
  const t = g.ctx.currentTime;
  for (const [voz, curva] of [[ativa(g), sai], [emEspera(g), entra]] as const) {
    voz.fader.gain.cancelScheduledValues(t);
    voz.fader.gain.setValueCurveAtTime(curva, t, segundos);
  }
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

/** A velocidade com que uma faixa VAI tocar (a dela, ou o padrão): a conta do `playTrack`. */
function velocidadeDaFaixa(t: Track): number {
  const st = usePlayer.getState();
  return arredondarRate(ajusteAoTocar(st.ajustesPorFaixa, chaveDaFaixa(t), { rate: st.padraoRate, ganhos: st.padraoGanhos }).rate) || 1;
}

/**
 * O caminho de uma faixa para o `<audio>`: da cache se estiver inteira, senão
 * resolvida e registada na casca. `t0` só na faixa que se mede (a do clique).
 */
async function caminhoDaFaixa(id: string, t0: number | null): Promise<string> {
  const p = ponte();
  let caminho: string | null = null;
  try { caminho = (await p.audioNaCache(id))?.caminho ?? null; } catch { caminho = null; }
  if (caminho) {
    if (t0 != null && marca?.id === id) marca.origem = 'cache';
    return caminho;
  }
  const s = await resolveYouTubeStream(id, 'high', false, 'opus');
  if (t0 != null && marca?.id === id) { marca.origem = 'rede'; marca.resolvido = Math.round(performance.now() - t0); }
  if (s.isHls || !s.contentLength) throw new Error('sem ficheiro de áudio (HLS)');
  const mime = s.formato === 'opus' ? 'audio/webm; codecs="opus"' : 'audio/mp4; codecs="mp4a.40.2"';
  registados.set(id, { tamanho: s.contentLength, mime, formato: s.formato === 'opus' ? 'opus' : 'aac' });
  return String(await p.registarAudio(id, s.url, s.contentLength, mime));
}

/** O que se registou na casca por faixa: a renovação volta a registar o MESMO ficheiro com outro URL. */
const registados = new Map<string, { tamanho: number; mime: string; formato: 'opus' | 'aac' }>();
/** Quantas renovações uma faixa tem direito por vez que toca (a 1.ª com identidade nova, a 2.ª a resolver de novo). */
const RENOVACOES_POR_FAIXA = 2;

/** A passagem acabou e pediu o `ended`: a fila tem isto para trocar para a preparada. */
const ESPERA_PELA_ENTREGA_MS = 3000;

type Seguinte = { sourceId: string; pronta: boolean; rate: number; falhou?: boolean };

/**
 * O motor de uma faixa. `aoFalhar` passa-a ao IFrame.
 *
 * O CROSSFADE (21/11), porta do do IFrame (`YouTubePlayerView.web.tsx`) com as
 * MESMAS decisões (`lib/crossfade.ts`): perto do fim a seguinte prepara-se
 * calada na voz em espera (`ANTECEDENCIA_DO_PC_S`); na janela da passagem os
 * faders cruzam-se pela curva de igual potência; no fim a fila avança pelo
 * `ended` de sempre e, quando a loja muda para a preparada, os papéis trocam-se
 * sem carregar nada.
 * - Só a voz ativa fala com a loja (posição, a tocar, fim, erros).
 * - Seguinte à mão com a preparada pronta: troca-se na hora (cortar). Outra
 *   faixa: a preparada cala-se.
 * - Pausa a meio: a que entra fica parada onde ia, e a passagem recomeça pela
 *   posição. Seek para trás: aborta, e a preparada volta ao 0.
 * - Sem crossfade num Jam nem a seguir um amigo: esses tocam pelo IFrame.
 */
function MotorDeAudio({ track, aoFalhar, recurso }: { track: Track; aoFalhar: (sourceId: string, porque: string) => void; recurso: ReadonlySet<string> }) {
  const faixaRef = useRef(track);
  faixaRef.current = track;
  const recursoRef = useRef(recurso);
  recursoRef.current = recurso;
  const aCarregarRef = useRef(false);
  const ultimoProgressoRef = useRef(0);
  /** As renovações da faixa que toca (zeram quando muda de faixa: é outro id). */
  const renovacaoRef = useRef<{ id: string; vezes: number; renovar: (() => Promise<string | null>) | null } | null>(null);
  /** A faixa preparada na voz em espera; `pronta` quando já pode soar. */
  const seguinteRef = useRef<Seguinte | null>(null);
  /** Há uma passagem a decorrer (a duração do fade dela). */
  const passagemRef = useRef<{ fade: number } | null>(null);
  /** A passagem acabou e pediu o `ended`; à espera que a loja mude de faixa. */
  const entregaRef = useRef<{ deQual: string } | null>(null);

  const progresso = React.useCallback((forcar = false) => {
    const agora = Date.now();
    if (!forcar && agora - ultimoProgressoRef.current < (document.hidden ? 5000 : 1000)) return;
    ultimoProgressoRef.current = agora;
    const a = ativa(oGrafo()).audio;
    const duracao = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : (faixaRef.current.durationSeconds || 0);
    usePlayer.getState()._setProgress(a.currentTime * 1000, duracao * 1000);
  }, []);

  /** A que entrava cala-se e para; a que sai volta ao seu nível. `rebobinar`: a preparada volta ao 0. */
  const abortarPassagem = React.useCallback((rebobinar: boolean) => {
    const g = oGrafo();
    if (passagemRef.current) desfazerPassagem();
    passagemRef.current = null;
    const e = emEspera(g);
    faderEm(g, e, 0);
    try { e.audio.pause(); } catch { /* já parada */ }
    if (rebobinar) { try { e.audio.currentTime = 0; } catch { /* sem metadados */ } }
    faderEm(g, ativa(g), 1);
  }, []);

  /** A preparada deixou de servir (outra faixa, fila mexida): calada e largada. */
  const largarSeguinte = React.useCallback(() => {
    const g = oGrafo();
    if (!seguinteRef.current && !passagemRef.current && !entregaRef.current && !emEspera(g).id) return;
    if (passagemRef.current) desfazerPassagem();
    passagemRef.current = null;
    seguinteRef.current = null;
    entregaRef.current = null;
    largarVoz(g, emEspera(g));
    faderEm(g, ativa(g), 1);
  }, []);

  /** Carrega a seguinte na voz em espera, calada. Uma falha não se repete: a vez dela vai pelo caminho de sempre. */
  const prepararSeguinte = React.useCallback((t: Track) => {
    const g = oGrafo();
    const prep: Seguinte = { sourceId: t.sourceId, pronta: false, rate: velocidadeDaFaixa(t) };
    seguinteRef.current = prep;
    void caminhoDaFaixa(t.sourceId, null).then((caminho) => {
      if (seguinteRef.current !== prep) return;
      const e = emEspera(g);
      faderEm(g, e, 0);
      e.id = prep.sourceId;
      e.audio.src = caminho;
      e.audio.playbackRate = prep.rate;
      (e.audio as any).preservesPitch = false;
      e.audio.volume = volumeDoMotor(usePlayer.getState().volume);
      // Sem `load()`: pôr o `src` já carrega, e o `load()` repunha a velocidade a 1.
    }).catch((err: unknown) => {
      if (seguinteRef.current !== prep) return;
      prep.falhou = true;
      registarNaCasca(`motor: ${prep.sourceId} a seguinte não se preparou (${String(err)})`);
    });
  }, []);

  /** A passagem chegou ao fim: a fila avança pelo `ended` de sempre. */
  const terminarPassagem = React.useCallback(() => {
    if (!passagemRef.current) return;
    passagemRef.current = null;
    const g = oGrafo();
    const deQual = faixaRef.current.sourceId;
    // Antes da pausa: o "pause" da que sai não é uma pausa da pessoa.
    entregaRef.current = { deQual };
    faderEm(g, emEspera(g), 1);
    const sai = ativa(g);
    faderEm(g, sai, 0);
    try { sai.audio.pause(); } catch { /* já parada */ }
    usePlayer.getState()._onYtStateChange('ended');
    // Rede de segurança: a fila não avançou para a preparada.
    setTimeout(() => {
      const e = entregaRef.current;
      if (!e || e.deQual !== deQual || faixaRef.current.sourceId !== deQual) return;
      registarNaCasca(`motor: ${deQual} a fila não avançou para a preparada`);
      largarSeguinte();
    }, ESPERA_PELA_ENTREGA_MS);
  }, [largarSeguinte]);

  /** O crossfade, a cada `timeupdate` da voz ativa (~4 por segundo, também escondida). */
  const cuidarDaPassagem = React.useCallback((posicao: number, duracao: number) => {
    const g = oGrafo();
    const st = usePlayer.getState();
    // Longe do fim não há nada a decidir (são ~4 leituras por segundo).
    const fade = st.crossfadeSegundos ?? 0;
    const longe = duracao > 0 ? duracao - posicao > Math.max(0, fade) + ANTECEDENCIA_DO_PC_S + 2 : fade <= 0;
    if (!passagemRef.current && !seguinteRef.current && longe) return;
    const seguinte = st.proximaFaixaParaOMotor();
    const prep = seguinteRef.current;
    // A seguinte mudou (fila mexida, shuffle, repeat): a preparada já não serve.
    if (prep && !passagemRef.current && !entregaRef.current && prep.sourceId !== seguinte?.sourceId) largarSeguinte();
    const c: ContextoDoCrossfade = {
      duracaoDoFade: fade,
      duracaoSegundos: duracao > 0 ? duracao : null,
      posicaoSegundos: posicao,
      // Uma seguinte que já falhou neste motor vai pelo IFrame: não se prepara aqui.
      temFaixaSeguinte: !!seguinte && seguinte.source === 'youtube' && !recursoRef.current.has(seguinte.sourceId),
      repeatUma: st.repeatMode === 'one',
      backendNativo: true,
      seguinteCarregada: !!seguinteRef.current?.pronta,
      aDecorrer: !!passagemRef.current,
      // Duas faixas do mesmo disco entram uma na outra sem fade (24/10).
      mesmoDisco: seguemNoMesmoDisco(faixaRef.current, seguinte),
    };
    const passagem = passagemRef.current;
    if (passagem) {
      const decorrido = decorridoDaPassagem({ ...c, duracaoDoFade: passagem.fade });
      if (decorrido < -0.5 || c.repeatUma) { abortarPassagem(true); return; }
      if (decorrido >= passagem.fade) terminarPassagem();
      return;
    }
    if (entregaRef.current || !st.isPlaying) return;
    // Sem passagem possível (crossfade desligado, o mesmo disco, uma faixa curta)
    // a seguinte prepara-se na mesma: no `ended` troca-se de voz sem carregar
    // nada, e a música seguinte entra logo (21/11; num disco ao vivo, sem buraco).
    const semPassagem = !podeCrossfade(c) && c.temFaixaSeguinte && !c.repeatUma && posicao > 0 && duracao > 0 && duracao - posicao <= ANTECEDENCIA_DO_PC_S;
    if (seguinte && !seguinteRef.current && (devePrepararSeguinte(c, ANTECEDENCIA_DO_PC_S) || semPassagem)) prepararSeguinte(seguinte);
    if (seguinte && deveComecarCrossfade(c)) {
      const e = emEspera(g);
      const rate = seguinteRef.current?.rate ?? 1;
      const velocidade = ativa(g).audio.playbackRate || 1;
      passagemRef.current = { fade: c.duracaoDoFade };
      // A velocidade DELA, e não a da que sai.
      e.audio.playbackRate = rate;
      (e.audio as any).preservesPitch = false;
      e.audio.volume = volumeDoMotor(st.volume);
      agendarPassagem(g, decorridoDaPassagem(c), c.duracaoDoFade, velocidade);
      void g.ctx.resume().catch(() => {});
      e.audio.play().catch(() => abortarPassagem(true));
      // As Duas luas (C9): daqui em diante andam sozinhas, o motor só diz se a desfaz.
      anunciarPassagem({ de: faixaRef.current.sourceId, para: seguinte, comecaEm: Date.now(), duracaoMs: (c.duracaoDoFade * 1000) / velocidade, automix: null });
    }
  }, [abortarPassagem, largarSeguinte, prepararSeguinte, terminarPassagem]);
  const cuidarRef = useRef(cuidarDaPassagem);
  cuidarRef.current = cuidarDaPassagem;

  // Os eventos das duas vozes e os controlos: uma vez por montagem. Só a ativa fala com a loja.
  useEffect(() => {
    ligarOFetch();
    const g = oGrafo();
    const st = usePlayer.getState();
    const daAtiva = (ev: Event) => ev.target === ativa(g).audio;
    /**
     * A renovação no 403 (21/11). O googlevideo cortou o URL (a meio, ou já à
     * partida, agora que não há sonda): a casca responde 403 até haver outro.
     * Renova-se como no iPhone (`criarRenovacao`: a 1.ª com identidade nova),
     * regista-se o MESMO ficheiro com o URL novo e retoma-se no mesmo segundo.
     * Só se isso falhar é que a faixa passa ao IFrame.
     */
    const renovarOuFalhar = async (v: Voz, codigo: number) => {
      const id = faixaRef.current.sourceId;
      const reg = registados.get(id);
      const r = renovacaoRef.current?.id === id ? renovacaoRef.current : (renovacaoRef.current = { id, vezes: 0, renovar: null });
      if (!reg || v.id !== id || r.vezes >= RENOVACOES_POR_FAIXA) { aoFalhar(id, `audio error ${codigo}`); return; }
      r.vezes += 1;
      const pos = v.audio.currentTime || 0;
      const tocava = usePlayer.getState().isPlaying;
      registarNaCasca(`motor: ${id} erro ${codigo} aos ${pos.toFixed(1)} s, a renovar (${r.vezes}.ª)`);
      usePlayer.getState()._setBuffering(true);
      try {
        r.renovar ??= criarRenovacao(id, 'high', reg.formato);
        const url = await r.renovar();
        if (!url) throw new Error('sem URL do mesmo formato');
        if (faixaRef.current.sourceId !== id || ativa(g) !== v) return;
        const caminho = String(await ponte().registarAudio(id, url, reg.tamanho, reg.mime));
        aCarregarRef.current = true;
        // Outro endereço para o `<audio>` (o mesmo `src` não recarregava); a casca ignora o `?`.
        v.audio.src = `${caminho}?v=${Date.now()}`;
        v.audio.playbackRate = usePlayer.getState().playbackRate || 1;
        (v.audio as any).preservesPitch = false;
        if (pos > 0) v.audio.addEventListener('loadedmetadata', () => { try { v.audio.currentTime = pos; } catch { /* fica no início */ } }, { once: true });
        if (tocava) await v.audio.play();
        registarNaCasca(`motor: ${id} renovado, retoma aos ${pos.toFixed(1)} s`);
      } catch (err: unknown) {
        if (faixaRef.current.sourceId === id) aoFalhar(id, `audio error ${codigo}; renovação: ${String(err)}`);
      }
    };
    st.registerYtControls({
      play: () => { void g.ctx.resume(); ativa(g).audio.play().catch(() => {}); },
      // A pausa suspende a passagem: a que entra fica parada onde ia.
      // Primeiro cala, depois repõe os faders: ao contrário, a que sai subia um instante antes de parar.
      pause: () => { ativa(g).audio.pause(); if (passagemRef.current) abortarPassagem(false); },
      seek: (ms: number) => { try { ativa(g).audio.currentTime = ms / 1000; } catch { /* sem metadados ainda */ } },
      setVolume: (vol: number) => { for (const v of g.vozes) v.audio.volume = volumeDoMotor(vol); },
    });
    const aoTocar = (ev: Event) => {
      if (!daAtiva(ev)) return;
      const m = marca;
      if (m && m.id === faixaRef.current.sourceId) {
        marca = null;
        const ms = Math.round(performance.now() - m.t0);
        registarNaCasca(`motor: ${m.id} som aos ${ms} ms (${m.origem}${m.resolvido != null ? `, resolver ${m.resolvido} ms` : ''})`);
        // O "time to first sound" do relatório do PC, e o mesmo evento que o IFrame manda ('embed').
        const origem = m.origem === 'cache' ? 'cache' : 'stream';
        anotarPrimeiroSom(m.id, tituloDaFaixa(faixaRef.current), origem, ms, Date.now() - ms, m.resolvido);
        const medida = primeiraNota(Date.now() - ms, Date.now(), origem);
        if (medida) registarEvento('primeira_nota', medida);
      }
      aCarregarRef.current = false;
      const s = usePlayer.getState();
      s.setError(null); s._setBuffering(false); s._setActiveBackend('native'); s._onYtStateChange('playing');
      progresso(true);
    };
    const aoPausar = (ev: Event) => {
      if (!daAtiva(ev)) return;
      const a = ativa(g).audio;
      if (!aCarregarRef.current && !a.ended && !entregaRef.current) usePlayer.getState()._onYtStateChange('paused');
      progresso(true);
    };
    const aoAcabar = (ev: Event) => {
      if (!daAtiva(ev)) return;
      // O fim da que sai, a meio de uma passagem, é o fim da passagem, e não um
      // segundo `ended`, que saltava uma faixa.
      if (passagemRef.current || entregaRef.current) { terminarPassagem(); return; }
      usePlayer.getState()._onYtStateChange('ended');
    };
    const aoEsperar = (ev: Event) => { if (daAtiva(ev)) usePlayer.getState()._setBuffering(true); };
    const aoTempo = (ev: Event) => {
      if (!daAtiva(ev)) return;
      progresso();
      const a = ativa(g).audio;
      const duracao = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : (faixaRef.current.durationSeconds || 0);
      cuidarRef.current(a.currentTime, duracao);
    };
    const aoPoderTocar = (ev: Event) => {
      const e = emEspera(g);
      const prep = seguinteRef.current;
      if (ev.target === e.audio && prep && !prep.falhou && e.id === prep.sourceId) prep.pronta = true;
    };
    const aoErro = (ev: Event) => {
      const v = g.vozes.find((x) => x.audio === ev.target);
      if (!v || !v.audio.getAttribute('src')) return;
      if (v === ativa(g)) { void renovarOuFalhar(v, v.audio.error?.code ?? 0); return; }
      // A preparada falhou: esquece-se, e quando chegar a vez dela vai pelo caminho de sempre.
      const prep = seguinteRef.current;
      if (prep) { prep.falhou = true; prep.pronta = false; }
      if (passagemRef.current) abortarPassagem(false);
      registarNaCasca(`motor: ${v.id ?? '?'} sem crossfade, a preparada deu erro ${v.audio.error?.code ?? 0}`);
      largarVoz(g, v);
    };
    const eventos: [string, (ev: Event) => void][] = [
      ['playing', aoTocar], ['pause', aoPausar], ['ended', aoAcabar], ['waiting', aoEsperar],
      ['timeupdate', aoTempo], ['canplay', aoPoderTocar], ['error', aoErro],
    ];
    for (const v of g.vozes) for (const [nome, f] of eventos) v.audio.addEventListener(nome, f);
    return () => {
      for (const v of g.vozes) for (const [nome, f] of eventos) v.audio.removeEventListener(nome, f);
      // O motor sai (o IFrame vai tocar esta faixa, ou a casca desmontou): cala-se.
      if (passagemRef.current) desfazerPassagem();
      passagemRef.current = null;
      seguinteRef.current = null;
      entregaRef.current = null;
      aCarregarRef.current = true;
      for (const v of g.vozes) largarVoz(g, v);
    };
  }, [aoFalhar, abortarPassagem, terminarPassagem, progresso]);

  // Trocar de faixa.
  useEffect(() => {
    let cancelado = false;
    let vigia: ReturnType<typeof setTimeout> | undefined;
    const g = oGrafo();
    const st = usePlayer.getState();
    const id = track.sourceId;

    // CAMINHO CURTO: a faixa que entra é a preparada (o fim de uma passagem, ou
    // um "seguinte" à mão perto do fim). Trocam-se os papéis, sem carregar nada.
    const prep = seguinteRef.current;
    const e = emEspera(g);
    if (prep?.pronta && !prep.falhou && prep.sourceId === id && e.id === id) {
      const sai = ativa(g);
      g.ativa = g.ativa === 0 ? 1 : 0;
      seguinteRef.current = null;
      passagemRef.current = null;
      entregaRef.current = null;
      marca = null;
      // A que sai PARA e larga o que tinha, em vez de ficar com a música inteira na memória.
      largarVoz(g, sai);
      faderEm(g, e, 1);
      e.audio.volume = volumeDoMotor(st.volume);
      e.audio.playbackRate = st.playbackRate || 1;
      aCarregarRef.current = false;
      st.setError(null);
      st._setBuffering(false);
      st._setActiveBackend('native');
      if (st.isPlaying || st.autoplayOnLoad) {
        void g.ctx.resume().catch(() => {});
        if (e.audio.paused) e.audio.play().catch(() => {});
        // A voz que entrou já estava a tocar: não vai mandar outro "playing".
        st._onYtStateChange('playing');
      }
      progresso(true);
      return;
    }

    // Outra faixa qualquer: a preparada cala-se, e a voz ativa carrega esta.
    largarSeguinte();
    const voz = ativa(g);
    const a = voz.audio;
    faderEm(g, voz, 1);
    aCarregarRef.current = true;
    st._setBuffering(true);
    st._setActiveBackend('resolving');
    (async () => {
      const t0 = performance.now();
      marca = { id, t0, origem: '?', resolvido: null };
      // Uma música pedida que nunca chega a "playing" (nem a erro) também fica no registo.
      vigia = setTimeout(() => {
        if (marca?.id === id && usePlayer.getState().isPlaying) registarNaCasca(`motor: ${id} sem som aos 12 s (${marca.origem}${marca.resolvido != null ? `, resolver ${marca.resolvido} ms` : ''})`);
      }, 12_000);
      const caminho = await caminhoDaFaixa(id, t0);
      if (cancelado) return;
      const agora = usePlayer.getState();
      voz.id = id;
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
    })().catch((err: unknown) => {
      if (cancelado) return;
      // Só para o diagnóstico (registarNaFila): a pessoa não vê isto, a faixa toca pelo IFrame.
      aoFalhar(id, String(err));
    });
    return () => { cancelado = true; clearTimeout(vigia); };
  }, [track.sourceId, aoFalhar, largarSeguinte, progresso]);

  // A velocidade escolhida (fora de Jam e sem seguir ninguém: esses vão para o IFrame).
  const velocidade = usePlayer((s) => s.playbackRate);
  useEffect(() => {
    const g = oGrafo();
    ativa(g).audio.playbackRate = velocidade || 1;
    for (const v of g.vozes) (v.audio as any).preservesPitch = false;
  }, [velocidade]);

  return null;
}

/**
 * Que motor toca esta faixa. O só de áudio (também com crossfade, desde 21/11), salvo:
 * - num Jam ou a seguir um amigo (ainda só o IFrame os sabe fazer);
 * - numa faixa em que ele já falhou nesta sessão (vai pelo IFrame, como hoje).
 */
function MotorDoPcTauri({ track }: { track: Track }) {
  const emJam = useOuvirJuntos((s) => !!s.sessao);
  const aSeguir = useSeguirAmigo((s) => s.ritmo != null);
  const [recurso, setRecurso] = useState<ReadonlySet<string>>(() => new Set());
  const aoFalhar = React.useCallback((sourceId: string, porque: string) => {
    registarNaFila(`${sourceId}: motor só de áudio falhou (${porque}); toca pelo IFrame`);
    registarNaCasca(`motor: ${sourceId} FALHOU (${porque}), vai pelo IFrame`);
    setRecurso((antes) => (antes.has(sourceId) ? antes : new Set(antes).add(sourceId)));
  }, []);
  const soDeAudio = !emJam && !aSeguir && !recurso.has(track.sourceId);
  // Porque é que esta faixa vai pelo IFrame (21/11: uma audição inteira sem rasto no registo).
  const porque = emJam ? 'Jam' : aSeguir ? 'a seguir um amigo' : recurso.has(track.sourceId) ? 'falhou antes' : null;
  useEffect(() => {
    if (porque) registarNaCasca(`motor: ${track.sourceId} pelo IFrame (${porque})`);
  }, [track.sourceId, porque]);
  return soDeAudio ? <MotorDeAudio track={track} aoFalhar={aoFalhar} recurso={recurso} /> : <YouTubePlayerView track={track} />;
}

/** O motor do PC: no Electron é o `YouTubePlayerView` de sempre, sem mais nada. */
export const MotorDoPc: (props: { track: Track }) => React.ReactElement | null = haMotorSoDeAudio() ? MotorDoPcTauri : YouTubePlayerView;
