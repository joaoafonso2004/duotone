import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import { idDaConta } from '../lib/idDaConta';
import { pickProfileImage, prepareProfileImage } from '../lib/profileImage';
import {
  BALDE_DAS_CAPAS, caminhoDaCapa, caminhoValido, comCapa, LINK_DA_CAPA_VALE_S, quaisAssinar, type LinkDaCapa,
} from '../lib/capasDasPlaylists';
import type { Playlist } from '../types';

/**
 * As capas das playlists à escolha, do lado do Storage (26/11; a lógica e o
 * porquê em `lib/capasDasPlaylists.ts`, o SQL em supabase/capas-das-playlists.sql).
 *
 * Os links assinados guardam-se no disco, por conta: a lista das playlists lê-se
 * a cada abertura, e sem isto cada leitura era um pedido ao Storage. Um pedido
 * só (`createSignedUrls`) assina todas as que faltam.
 */

const CHAVE = (conta: string) => `capas-das-playlists:v1:${conta}`;
let links = new Map<string, LinkDaCapa>();
let contaDosLinks: string | null = null;

async function carregarLinks(conta: string): Promise<void> {
  if (contaDosLinks === conta) return;
  contaDosLinks = conta;
  links = new Map();
  try {
    const cru = await AsyncStorage.getItem(CHAVE(conta));
    const linhas: unknown = cru ? JSON.parse(cru) : [];
    if (Array.isArray(linhas)) {
      for (const l of linhas.slice(-200)) {
        if (Array.isArray(l) && caminhoValido(l[0]) && typeof l[1]?.url === 'string' && Number.isFinite(l[1]?.ate)) links.set(l[0], l[1]);
      }
    }
  } catch { /* sem disco, pedem-se */ }
}

function guardarLinks(conta: string): void {
  void AsyncStorage.setItem(CHAVE(conta), JSON.stringify([...links].slice(-200))).catch(() => {});
}

/**
 * Põe à vista a capa das playlists que a têm. Falhar não estraga nada: fica o
 * mosaico das músicas.
 */
export async function assinarCapas<T extends Playlist>(lista: T[]): Promise<T[]> {
  if (!lista.some((p) => p.capa)) return lista;
  const conta = await idDaConta().catch(() => null);
  if (!conta) return lista.map((p) => comCapa(p, null));
  await carregarLinks(conta);
  const pedir = quaisAssinar(lista.map((p) => p.capa), links, Date.now());
  if (pedir.length) {
    try {
      const { data } = await supabase.storage.from(BALDE_DAS_CAPAS).createSignedUrls(pedir, LINK_DA_CAPA_VALE_S);
      const ate = Date.now() + LINK_DA_CAPA_VALE_S * 1000;
      for (const l of data ?? []) if (l.path && l.signedUrl && !l.error) links.set(l.path, { url: l.signedUrl, ate });
      if (contaDosLinks === conta) guardarLinks(conta);
    } catch { /* fica o mosaico */ }
  }
  return lista.map((p) => comCapa(p, p.capa ? links.get(p.capa)?.url : null));
}

/** Apaga imagens de capas que deixaram de ser usadas. Sem pressa: um ficheiro órfão não se vê. */
export async function apagarCapas(caminhos: readonly (string | null | undefined)[]): Promise<void> {
  const validos = caminhos.filter((c): c is string => caminhoValido(c));
  if (!validos.length) return;
  for (const c of validos) links.delete(c);
  const { error } = await supabase.storage.from(BALDE_DAS_CAPAS).remove(validos);
  if (error) throw error;
}

/**
 * Escolhe uma imagem, recorta-a ao quadrado (512 px, como o avatar), carrega-a
 * e põe-na na playlist. `null` se a pessoa cancelou. Devolve o caminho e o link.
 */
export async function escolherCapa(playlistId: string, antiga: string | null | undefined): Promise<{ capa: string; url: string } | null> {
  const eu = await idDaConta();
  if (!eu) throw new Error('Your session has expired.');
  const imagem = await pickProfileImage();
  if (!imagem) return null;
  const bytes = await prepareProfileImage(imagem, 'avatar');
  const capa = caminhoDaCapa(eu, Crypto.randomUUID());
  const { error: falhou } = await supabase.storage.from(BALDE_DAS_CAPAS).upload(capa, bytes, { contentType: 'image/jpeg', upsert: false });
  if (falhou) throw falhou;
  const { data, error } = await supabase.from('playlists').update({ capa }).eq('id', playlistId).eq('owner_id', eu).select('id').maybeSingle();
  if (error || !data) {
    void apagarCapas([capa]).catch(() => {});
    throw error ?? new Error('This playlist is no longer available to edit.');
  }
  // Só depois de a nova estar gravada sai a antiga.
  if (antiga && antiga !== capa) void apagarCapas([antiga]).catch(() => {});
  const { data: link } = await supabase.storage.from(BALDE_DAS_CAPAS).createSignedUrl(capa, LINK_DA_CAPA_VALE_S);
  const url = link?.signedUrl ?? '';
  if (url) {
    links.set(capa, { url, ate: Date.now() + LINK_DA_CAPA_VALE_S * 1000 });
    if (contaDosLinks === eu) guardarLinks(eu);
  }
  return { capa, url };
}

/** Tira a capa: volta o mosaico das músicas. */
export async function tirarCapa(playlistId: string, antiga: string | null | undefined): Promise<void> {
  const eu = await idDaConta();
  if (!eu) throw new Error('Your session has expired.');
  const { data, error } = await supabase.from('playlists').update({ capa: null }).eq('id', playlistId).eq('owner_id', eu).select('id').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This playlist is no longer available to edit.');
  if (antiga) void apagarCapas([antiga]).catch(() => {});
}

/** Ao apagar a conta: o Storage exige que os ficheiros saiam pela API antes. */
export async function apagarAsMinhasCapas(): Promise<void> {
  const eu = await idDaConta();
  if (!eu) return;
  for (;;) {
    const { data, error } = await supabase.storage.from(BALDE_DAS_CAPAS).list(eu, { limit: 100 });
    // Sem o balde (o SQL por correr), não há nada para apagar.
    if (error) return;
    const ficheiros = (data ?? []).filter((f) => f.id).map((f) => `${eu}/${f.name}`);
    if (!ficheiros.length) return;
    await apagarCapas(ficheiros);
  }
}
