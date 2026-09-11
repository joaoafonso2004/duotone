import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { chaveDeArtista, displayArtist, tituloDaFaixa } from '../lib/artistName';
import { normalizar } from '../lib/catalogoDaFaixa';
import { marcasDeVersao, nucleoDoTitulo, pickBest } from '../lib/trackMatch';
import { classificar, sinalDoErro } from '../lib/playbackDiagnostics';
import {
  veredictoDaCapa, veredictoDoExtrator, veredictoDoOEmbed,
  type AjudantesDaHigiene, type Disponibilidade,
} from '../lib/higieneDaBiblioteca';
import { upsertTrack } from './library';
import { searchYouTubeFreeWithChannel } from './ytSearchFree';
import type { Track } from '../types';

/**
 * O Library check, a parte que fala com a rede e com a base de dados. As
 * decisões vivem em `lib/higieneDaBiblioteca.ts`; aqui só há transporte.
 */

/** Os nomes como o resto da app os lê. */
export const ajudantes: AjudantesDaHigiene = {
  artistaChave: (t) => chaveDeArtista(displayArtist(t)),
  titulo: (t) => tituloDaFaixa(t),
  nucleo: (titulo) => normalizar(nucleoDoTitulo(titulo)),
  marcas: (titulo) => marcasDeVersao(titulo),
};

/** Um pedido que não fica pendurado. `null` = sem resposta que sirva. */
async function pedir(url: string, init: RequestInit = {}, ms = 8000): Promise<Response | null> {
  const controlo = new AbortController();
  const t = setTimeout(() => controlo.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controlo.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * O vídeo ainda toca?
 *
 * O oEmbed do YouTube não gasta quota e responde nas duas plataformas (no PC,
 * com o `Access-Control-Allow-Origin` da própria origem da app -- medido a
 * 11/9/2026, no 200 e no 404). No iPhone, um "bloqueado" leva segunda opinião:
 * o extrator toca vídeos que o dono não deixa embutir, e só ele sabe se toca
 * NESTE telemóvel.
 */
export async function disponibilidade(videoId: string): Promise<Disponibilidade> {
  const alvo = encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`);
  const r = await pedir(`https://www.youtube.com/oembed?url=${alvo}&format=json`);
  const veredicto = veredictoDoOEmbed(r ? r.status : null);
  if (veredicto !== 'bloqueada' || Platform.OS !== 'ios') return veredicto;
  try {
    // Import dinâmico: o extrator só existe para o iPhone, e o PC não o carrega.
    const { resolveYouTubeStream } = await import('./ytstream');
    await resolveYouTubeStream(videoId);
    return 'ok';
  } catch (e) {
    return veredictoDoExtrator(classificar(sinalDoErro(e)));
  }
}

/** A imagem carrega? HEAD primeiro; um servidor que o recuse leva um GET. */
export async function estadoDoUrl(url: string): Promise<'ok' | 'partida' | 'nao-sei'> {
  let r = await pedir(url, { method: 'HEAD' });
  if (r && (r.status === 405 || r.status === 501)) r = await pedir(url);
  return veredictoDaCapa(r ? r.status : null);
}

/**
 * Uma cópia que toque, para trocar por um vídeo morto.
 *
 * O mesmo `pickBest` e a mesma pesquisa da importação do Spotify: penaliza ao
 * vivo, remix, slowed, karaoke e instrumental, e só devolve com confiança. Sem
 * confiança, nada -- trocar uma música pela errada é pior do que ficar com a
 * morta. A pesquisa é a livre, que traz o canal (o `pickBest` pesa-o) e não
 * gasta a quota da Data API: 100 unidades por pesquisa, de um tecto diário que
 * é de toda a gente.
 *
 * O alvo é o que o ecrã mostra -- o artista e o título limpos --, e não o
 * título cru do vídeo, que traz o artista à frente e fazia perder o bónus de
 * o nome bater certo. As marcas de versão ficam, porque o `tituloDaFaixa` não
 * as corta.
 */
export async function procurarCopia(original: Track, excluir: ReadonlySet<string>): Promise<Track | null> {
  const artista = displayArtist(original);
  const conhecido = artista && artista !== 'Unknown artist' ? artista : '';
  const titulo = tituloDaFaixa(original);
  const achados = (await searchYouTubeFreeWithChannel(`${conhecido} ${titulo}`.trim()))
    .filter((a) => a.track.source === 'youtube' && !excluir.has(a.track.sourceId) && a.track.sourceId !== original.sourceId);
  const r = pickBest(
    achados.map((a) => ({ id: a.track.sourceId, title: a.track.title, channel: a.channel, durationSec: a.track.durationSeconds })),
    { title: titulo, artist: conhecido, durationSec: original.durationSeconds },
  );
  if (!r.confident || !r.best) return null;
  return achados.find((a) => a.track.sourceId === r.best!.id)?.track ?? null;
}

/** O que o "Undo" precisa para pôr uma junção como estava. */
export type Juncao = { fica: string; sai: string; registo: unknown };

/**
 * O erro de uma das funções, dito em inglês. Sem o SQL aplicado a função não
 * existe, e diz-se isso em vez de "erro". As mensagens do próprio SQL estão
 * em português e não chegam ao ecrã: vai-se pelo código.
 */
function erroDaFuncao(error: { code?: string; message?: string }): Error {
  if (error.code === 'PGRST202') return new Error('This needs a database update that is not installed yet.');
  if (error.code === '42501') return new Error('This song is not in your library any more. Check again to refresh the list.');
  if (error.code === '22023') return new Error('This song changed since the check. Check again to refresh the list.');
  return new Error('Could not update your library. Check your connection and try again.');
}

/** A mesma música duas vezes passa a uma. Ver `supabase/higiene-da-biblioteca.sql`. */
export async function juntar(fica: string, sai: string): Promise<Juncao> {
  const { data, error } = await supabase.rpc('juntar_na_biblioteca', { p_fica: fica, p_sai: sai });
  if (error) throw erroDaFuncao(error);
  return { fica, sai, registo: data };
}

export async function desfazerJuncao(j: Juncao): Promise<void> {
  const { error } = await supabase.rpc('desfazer_juntar_na_biblioteca', {
    p_fica: j.fica, p_sai: j.sai, p_registo: j.registo,
  });
  if (error) throw erroDaFuncao(error);
}

/** Trocar um vídeo morto pela cópia: a cópia entra no catálogo e fica no lugar dele. */
export async function substituir(morta: Track, copia: Track): Promise<Juncao> {
  if (!morta.id) throw new Error('This song is not in your library.');
  const id = await upsertTrack(copia);
  return juntar(id, morta.id);
}

/** A capa passa a ser a miniatura do próprio vídeo. Devolve o URL novo. */
export async function corrigirCapa(trackId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('corrigir_capa', { p_track: trackId });
  if (error) throw erroDaFuncao(error);
  return typeof data === 'string' ? data : null;
}
