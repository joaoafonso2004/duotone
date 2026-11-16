import AsyncStorage from '@react-native-async-storage/async-storage';
import { artistaPrincipal, displayArtist } from '../lib/artistName';
import { chaveDeCatalogo } from '../lib/catalogo';
import { aindaValem, fotoDaMusica, fotosDoAudioDb, renovarFotos, type FotosDoArtista } from '../lib/fotosDoPoster';
import type { Track } from '../types';

/**
 * As fotos do artista para o Poster do leitor (16/11; as regras estão em
 * `lib/fotosDoPoster.ts`). Um pedido ao TheAudioDB por artista novo, e o
 * resultado fica no aparelho 30 dias (7 sem fotos), com a foto que calhou a
 * cada música. Nada passa pelo Supabase.
 */

const CHAVE = 'duotone:poster:fotos:v1';
const ENDERECO = 'https://www.theaudiodb.com/api/v1/json/123/search.php?s=';
const ESPERA_MS = 8000;

const conhecidas = new Map<string, FotosDoArtista>();
const aCaminho = new Map<string, Promise<FotosDoArtista | null>>();
let lidas: Promise<void> | null = null;
let gravar: ReturnType<typeof setTimeout> | undefined;

function lerDoDisco(): Promise<void> {
  if (!lidas) {
    lidas = AsyncStorage.getItem(CHAVE).then((texto) => {
      if (!texto) return;
      for (const [k, v] of JSON.parse(texto) as [string, FotosDoArtista][]) {
        if (!conhecidas.has(k) && v && Array.isArray(v.fotos)) conhecidas.set(k, { fotos: v.fotos, em: v.em, musicas: v.musicas ?? {} });
      }
    }).catch(() => {});
  }
  return lidas;
}

function lembrar(chave: string, f: FotosDoArtista) {
  conhecidas.set(chave, f);
  // Uma escrita por rajada, e não uma por música.
  clearTimeout(gravar);
  gravar = setTimeout(() => {
    void AsyncStorage.setItem(CHAVE, JSON.stringify([...conhecidas])).catch(() => {});
  }, 1500);
}

/** O artista de quem se procura a foto: o principal, como o leitor o mostra. */
function artistaDe(faixa: Track): string {
  const nome = artistaPrincipal(displayArtist(faixa));
  return nome && nome !== 'Unknown artist' ? nome : '';
}

const musicaDe = (faixa: Track) => `${faixa.source}:${faixa.sourceId}`;

/** A foto que calha a esta música, guardando-a se for a primeira vez. */
function escolher(chave: string, f: FotosDoArtista, faixa: Track): string | null {
  const r = fotoDaMusica(f, musicaDe(faixa));
  if (r.fotos !== f) lembrar(chave, r.fotos);
  return r.foto;
}

/**
 * Sem esperar, se já se souber: a foto da música (`string`), que este artista
 * não tem fotos (`null`), ou ainda não se sabe (`undefined`, e começa-se a ler
 * o disco). O leitor desenha logo a certa, sem passar pela capa.
 */
export function fotoDoPosterJaConhecida(faixa: Track): string | null | undefined {
  void lerDoDisco();
  const chave = chaveDeCatalogo(artistaDe(faixa));
  if (!chave) return null;
  const f = conhecidas.get(chave);
  return aindaValem(f, Date.now()) ? escolher(chave, f, faixa) : undefined;
}

async function pedirFotos(nome: string, chave: string): Promise<FotosDoArtista | null> {
  const parar = new AbortController();
  const prazo = setTimeout(() => parar.abort(), ESPERA_MS);
  try {
    const r = await fetch(ENDERECO + encodeURIComponent(nome), { signal: parar.signal });
    // Sem resposta (rede, limite de pedidos): não se sabe, e a próxima música pergunta outra vez.
    if (!r.ok) return null;
    const f = renovarFotos(conhecidas.get(chave), fotosDoAudioDb(await r.json(), chave, chaveDeCatalogo), Date.now());
    lembrar(chave, f);
    return f;
  } catch {
    return null;
  } finally {
    clearTimeout(prazo);
  }
}

/** A foto do artista para esta música, ou `null` (sem fotos, ou sem rede): fica a capa. */
export async function fotoDoPoster(faixa: Track): Promise<string | null> {
  await lerDoDisco();
  const nome = artistaDe(faixa);
  const chave = chaveDeCatalogo(nome);
  if (!chave) return null;
  const guardadas = conhecidas.get(chave);
  if (aindaValem(guardadas, Date.now())) return escolher(chave, guardadas, faixa);
  let pedido = aCaminho.get(chave);
  if (!pedido) {
    pedido = pedirFotos(nome, chave).finally(() => aCaminho.delete(chave));
    aCaminho.set(chave, pedido);
  }
  const f = await pedido;
  return f ? escolher(chave, conhecidas.get(chave) ?? f, faixa) : null;
}
