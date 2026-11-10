import AsyncStorage from '@react-native-async-storage/async-storage';
import { pesquisarCancoesCru } from '../api/ytMusic';
import { lerCancoes } from '../lib/cancoesDoYtMusic';
import {
  aplicarTrocas, chaveDoGrupo, gruposDeGemeas, juntarTrocas, paresDoYtMusic, perguntaDoGrupo,
} from '../lib/versoesClean';
import type { Track } from '../types';
import { useConnectivity } from './connectivity';

/**
 * Os pares clean/explícita que este aparelho já conhece (9/11). As regras estão
 * em `lib/versoesClean.ts`; aqui guarda-se o que se aprendeu e decide-se quando
 * perguntar.
 *
 * Fica no AsyncStorage (é só do aparelho, e sem SQL). Quanto custa: NADA na
 * maior parte das pesquisas. Só há um pedido ao YouTube Music quando os
 * resultados trazem duas músicas iguais que ainda não se viram, no máximo um
 * por pesquisa e um de 4 em 4 segundos; a resposta fica lembrada, e o mesmo par
 * nunca se pergunta duas vezes.
 */
const CHAVE = 'duotone:versoes-clean:v1';
/** Pares lembrados, e grupos já perguntados (para não repetir os que não deram nada). */
const TETO_DE_TROCAS = 3000;
const TETO_DE_PERGUNTADOS = 1000;
/** Escrever depressa numa caixa não pode virar uma rajada de perguntas. */
export const ESPERA_ENTRE_PERGUNTAS_MS = 4000;

type Memoria = { trocas: Record<string, string>; perguntados: string[] };

let memoria: Memoria | null = null;
let aLer: Promise<Memoria> | null = null;
let ultimaPergunta = 0;
const emCurso = new Set<string>();

function ler(): Promise<Memoria> {
  if (memoria) return Promise.resolve(memoria);
  aLer ??= AsyncStorage.getItem(CHAVE)
    .then((texto) => {
      const m = texto ? JSON.parse(texto) : null;
      memoria = {
        trocas: m && typeof m.trocas === 'object' && m.trocas ? m.trocas : {},
        perguntados: Array.isArray(m?.perguntados) ? m.perguntados : [],
      };
      return memoria;
    })
    .catch(() => (memoria = { trocas: {}, perguntados: [] }));
  return aLer;
}

function guardar(m: Memoria): void {
  memoria = m;
  AsyncStorage.setItem(CHAVE, JSON.stringify(m)).catch(() => { /* sem espaço: fica só em memória */ });
}

const capa = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
/** A explícita no lugar da clean: o mesmo título e artista, outro vídeo (e sem o id da base, que é da outra). */
function comOutroVideo(f: Track, id: string): Track {
  const { id: _daClean, ...resto } = f;
  return { ...resto, sourceId: id, artworkUrl: capa(id) };
}

/** Troca as clean pelas explícitas, com os pares dados. Só as do YouTube. */
export function trocarClean(faixas: Track[], trocas: Readonly<Record<string, string>>): Track[] {
  return aplicarTrocas(faixas, trocas, (f) => (f.source === 'youtube' ? f.sourceId : ''), comOutroVideo);
}

/** As clean que já se conhecem saem da lista. Não faz pedido nenhum. */
export async function semClean(faixas: Track[]): Promise<Track[]> {
  if (!faixas.length) return faixas;
  return trocarClean(faixas, (await ler()).trocas);
}

/** O mesmo, para resultados que trazem a faixa dentro (a importação quer o canal ao lado). */
export async function semCleanNosResultados<R extends { track: Track }>(resultados: R[]): Promise<R[]> {
  if (!resultados.length) return resultados;
  const { trocas } = await ler();
  return aplicarTrocas(resultados, trocas,
    (r) => (r.track.source === 'youtube' ? r.track.sourceId : ''),
    (r, id) => ({ ...r, track: comOutroVideo(r.track, id) }));
}

/**
 * Há duas iguais nestes resultados que ainda não se viram? Pergunta ao YouTube
 * Music qual é a explícita (UM pedido, pelo primeiro par) e devolve as trocas
 * novas, ou `null` se não perguntou ou não aprendeu nada.
 *
 * Só a caixa de pesquisa chama isto: é uma pessoa a olhar para a lista. O que a
 * app procura sozinha (Radio, importação) usa só o que já se sabe (`semClean`).
 */
export async function verGemeas(faixas: Track[], sinal?: AbortSignal): Promise<Record<string, string> | null> {
  if (useConnectivity.getState().offline || sinal?.aborted) return null;
  const m = await ler();
  const grupo = gruposDeGemeas(faixas.filter((f) => f.source === 'youtube').map((f) => ({
    id: f.sourceId, titulo: f.title, canal: f.artist ?? '', duracaoSec: f.durationSeconds ?? null,
  }))).find((g) => {
    const chave = chaveDoGrupo(g);
    return !emCurso.has(chave) && !m.perguntados.includes(chave) && !g.some((c) => m.trocas[c.id]);
  });
  if (!grupo) return null;
  if (Date.now() - ultimaPergunta < ESPERA_ENTRE_PERGUNTAS_MS) return null;
  const chave = chaveDoGrupo(grupo);
  emCurso.add(chave);
  ultimaPergunta = Date.now();
  try {
    const resposta = await pesquisarCancoesCru(perguntaDoGrupo(grupo), sinal);
    // Falhou ou foi cancelado: não fica como perguntado, tenta-se noutra altura.
    if (!resposta || sinal?.aborted) return null;
    const novas = paresDoYtMusic(lerCancoes(resposta));
    const agora = memoria ?? m;
    guardar({
      trocas: juntarTrocas(agora.trocas, novas, TETO_DE_TROCAS),
      perguntados: [...agora.perguntados.filter((p) => p !== chave), chave].slice(-TETO_DE_PERGUNTADOS),
    });
    return Object.keys(novas).length ? novas : null;
  } catch {
    return null;
  } finally {
    emCurso.delete(chave);
  }
}

/** Só para os testes: esquece o que está em memória (o armazenamento fica). */
export function esquecerEmMemoria(): void {
  memoria = null; aLer = null; ultimaPergunta = 0; emCurso.clear();
}
