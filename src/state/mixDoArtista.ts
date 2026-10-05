import { mixDoArtista, paginaDoArtista } from '../api/albunsDoArtista';
import { fetchRadioTracks } from '../api/radio';
import { getLibrary } from '../api/library';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { chaveDeArtista, displayArtist } from '../lib/artistName';
import type { Track } from '../types';
import { lerRadioPeloYtMusic } from '../api/ytMusic';
import type { MixDoArtista } from '../lib/albunsDoArtista';
import { novaEscolha } from '../lib/ultimaEscolha';
import { usePlayer } from './player';
import { gruposDaBiblioteca } from './gruposDaBiblioteca';

/**
 * Toca o Mix de um artista (29/9): o botão "Mix" da página dele e do artista
 * em destaque na pesquisa, nas duas plataformas. O Mix vem da página do
 * artista (`paginaDoArtista`) ou, na pesquisa, do canal que ela trouxe.
 * Sem Mix publicado, usa faixas deste artista para procurar música relacionada.
 *
 * O último toque ganha (2/10, lib/ultimaEscolha.ts): o Mix espera pela rede, e
 * se entretanto se escolheu outra música (ou outro Mix) não toca. Aí devolve
 * `true`: não falhou nada, e não há aviso a dar.
 */
export async function tocarMixDoArtista(
  nome: string, fonte: { mix?: MixDoArtista | null; canal?: string | null; faixas?: Track[] },
): Promise<boolean> {
  const aindaVale = novaEscolha();
  let mix = fonte.mix ?? (fonte.canal ? await mixDoArtista(fonte.canal) : null);
  if (!aindaVale()) return true;
  const artista = chaveDeArtista(nome);
  let sementes = (fonte.faixas ?? []).filter(t => chaveDeArtista(displayArtist(t)) === artista);
  if (!mix && fonte.faixas) {
    // O botão já pode ser usado no primeiro frame, antes da biblioteca chegar.
    if (!sementes.length) {
      const biblioteca = await lerFaixas(getLibrary);
      if (!aindaVale()) return true;
      sementes = gruposDaBiblioteca(biblioteca).find(g => g.chave === chaveDeArtista(nome))?.faixas ?? [];
    }
    const pagina = await paginaDoArtista(nome, sementes);
    if (!aindaVale()) return true;
    mix = pagina.mix;
    if (!sementes.length) sementes = pagina.musicas.filter(t => chaveDeArtista(displayArtist(t)) === chaveDeArtista(nome));
  }
  let faixas = mix ? await lerRadioPeloYtMusic(mix) : [];
  if (!aindaVale()) return true;
  if (!faixas.length && sementes.length) {
    // 'session' impede o fallback global do Flow de trocar o artista escolhido.
    faixas = await fetchRadioTracks(sementes.slice(0, 3), [], 50, new Set(), 'session');
  }
  if (!aindaVale()) return true;
  if (!faixas.length) return false;
  await usePlayer.getState().tocarLista(faixas, false, false, { tipo: 'prateleira', nome: `${nome} Mix` });
  return true;
}
