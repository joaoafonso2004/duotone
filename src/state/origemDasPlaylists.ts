import AsyncStorage from '@react-native-async-storage/async-storage';
import { dependenciasReais } from '../api/playlistPorLink';
import { removeTrackFromPlaylistBySource } from '../api/playlists';
import { avisarRemocao } from '../lib/avisoDeRemocao';
import { lerPlaylist, type FaixaImportada, type Leitura } from '../lib/importacaoPorLink';
import type { LinkDePlaylist } from '../lib/linkDePlaylist';
import {
  chavesDaLeitura, deveVer, juntarConhecidas, novasDaLeitura, type OrigemDaPlaylist,
} from '../lib/origemDasPlaylists';
import { useConnectivity } from './connectivity';
import { useImportacoes } from './importacoes';
import { usePlaylists } from './playlists';

/**
 * As playlists importadas de um link, que se atualizam sozinhas (9/11, a opção C
 * da maquete: "faz sozinho sem perguntar"). As regras estão em
 * `lib/origemDasPlaylists.ts`.
 *
 * O link fica NESTE aparelho (o João deixou-me escolher; sem SQL para correr à
 * mão): quem importou é quem atualiza, e as músicas novas entram na playlist,
 * que é da conta -- o outro aparelho vê-as na mesma.
 */
const CHAVE = 'duotone:origens-das-playlists';

async function ler(): Promise<Record<string, OrigemDaPlaylist>> {
  try {
    const texto = await AsyncStorage.getItem(CHAVE);
    const m = texto ? JSON.parse(texto) : {};
    return m && typeof m === 'object' ? m : {};
  } catch { return {}; }
}

async function mudar(playlistId: string, f: (o: OrigemDaPlaylist | undefined) => OrigemDaPlaylist | undefined): Promise<void> {
  const m = await ler();
  const novo = f(m[playlistId]);
  if (novo) m[playlistId] = novo; else delete m[playlistId];
  try { await AsyncStorage.setItem(CHAVE, JSON.stringify(m)); } catch { /* sem espaço: tenta-se na próxima */ }
}

/** Depois de importar de um link: de onde veio, e o que trazia. */
export async function guardarOrigem(playlistId: string, link: LinkDePlaylist, leitura: Pick<Leitura, 'linhas' | 'faixas'>): Promise<void> {
  if (!playlistId) return;
  await mudar(playlistId, () => ({ link, conhecidas: juntarConhecidas([], chavesDaLeitura(leitura)), vistaEm: Date.now() }));
}

/** A playlist foi apagada: esquece-se o link dela. */
export function esquecerOrigem(playlistId: string): Promise<void> {
  return mudar(playlistId, () => undefined);
}

const musicas = (n: number) => (n === 1 ? '1 new song' : `${n} new songs`);
const emCurso = new Set<string>();

/**
 * Ao abrir uma playlist (PC e iPhone): se veio de um link e passou um dia desde
 * a última leitura, lê-o outra vez e junta as novas, sem perguntar. Um aviso diz
 * quantas entraram, com Undo. As que o comparador não encontrou vão para a
 * mesma lista "Not found" da importação, com a pesquisa à mão.
 *
 * Em silêncio quando não há nada de novo, sem rede, ou se a leitura falhar:
 * tenta-se outra vez amanhã.
 */
export async function atualizarDaOrigem(playlistId: string, nome: string, aoMudar?: () => void): Promise<void> {
  if (!playlistId || emCurso.has(playlistId) || useConnectivity.getState().offline) return;
  const origem = (await ler())[playlistId];
  if (!deveVer(origem, Date.now())) return;
  emCurso.add(playlistId);
  try {
    // Marca-se já: uma falha a meio não volta a pedir ao abrir outra vez daqui a um minuto.
    await mudar(playlistId, (o) => (o ? { ...o, vistaEm: Date.now() } : o));
    const lida = await lerPlaylist(origem.link, dependenciasReais);
    const novas = novasDaLeitura(lida, origem.conhecidas);
    const entraram: FaixaImportada[] = [...novas.faixas];
    const faltaram: string[] = [];
    if (novas.linhas.length) {
      const r = await dependenciasReais.resolver(novas.linhas, () => {});
      r.forEach((x, i) => {
        if (x.track && x.confident) entraram.push(x.track);
        else faltaram.push(`${novas.linhas[i]!.artist} - ${novas.linhas[i]!.title}`);
      });
    }
    if (entraram.length) await dependenciasReais.adicionar(playlistId, entraram);
    await mudar(playlistId, (o) => (o ? { ...o, conhecidas: juntarConhecidas(o.conhecidas, chavesDaLeitura(lida)) } : o));
    if (!entraram.length && !faltaram.length) return;
    aoMudar?.();
    void usePlaylists.getState().carregar(true).catch(() => {});
    if (entraram.length) {
      avisarRemocao({
        texto: `Added ${musicas(entraram.length)} to ${nome}.`,
        detalhe: 'From the playlist you imported it from.',
        luz: 'avancar',
        desfazer: async () => {
          for (const t of entraram) await removeTrackFromPlaylistBySource(playlistId, t as any);
          aoMudar?.();
        },
      });
    }
    if (faltaram.length) {
      // As duas lojas importam-se uma à outra; só se tocam aqui, já com a app a correr.
      useImportacoes.getState().registarAtualizacao(nome, playlistId, entraram.length, faltaram);
    }
  } catch {
    // Em silêncio: o link pode ter ficado privado, ou a rede caiu. Amanhã tenta-se outra vez.
  } finally {
    emCurso.delete(playlistId);
  }
}
