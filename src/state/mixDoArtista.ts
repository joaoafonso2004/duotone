import { lembrarCanalDoArtista, paginaDoArtista } from '../api/albunsDoArtista';
import { fetchRadioTracks } from '../api/radio';
import { getLibrary } from '../api/library';
import { lerFaixas } from '../lib/cacheDaBiblioteca';
import { chaveDeArtista, displayArtist } from '../lib/artistName';
import { chavesDaMusica } from '../lib/identidadeDaMusica';
import { montarMixDoArtista } from '../lib/montarMixDoArtista';
import type { Track } from '../types';
import { lerRadioPeloYtMusic } from '../api/ytMusic';
import type { MixDoArtista } from '../lib/albunsDoArtista';
import { novaEscolha } from '../lib/ultimaEscolha';
import { usePlayer } from './player';
import { gruposDaBiblioteca } from './gruposDaBiblioteca';

/**
 * Toca o Mix de um artista (29/9): o botão "Mix" da página dele e do artista
 * em destaque na pesquisa, nas duas plataformas.
 *
 * Desde 10/10 o Mix é sobretudo DELE (`lib/montarMixDoArtista.ts`): as músicas
 * do canal baralhadas, a começar por um dos êxitos (à sorte), e uma parecida do
 * rádio do YouTube Music a cada duas. O rádio sozinho começava sempre pela
 * mesma música e era quatro quintos de outros artistas.
 *
 * As músicas e o rádio vêm da página do artista (`paginaDoArtista`, em memória
 * por sessão); na pesquisa, do canal que ela trouxe. Sem nada disso, usa as
 * faixas dele da biblioteca para procurar música relacionada.
 *
 * O último toque ganha (2/10, lib/ultimaEscolha.ts): o Mix espera pela rede, e
 * se entretanto se escolheu outra música (ou outro Mix) não toca. Aí devolve
 * `true`: não falhou nada, e não há aviso a dar.
 */
export async function tocarMixDoArtista(
  nome: string,
  fonte: { mix?: MixDoArtista | null; canal?: string | null; faixas?: Track[]; musicas?: Track[] },
): Promise<boolean> {
  const aindaVale = novaEscolha();
  const artista = chaveDeArtista(nome);
  const dele = (t: Track) => chaveDeArtista(displayArtist(t)) === artista
    || (t.artist ?? '').split(' & ').some((parte) => chaveDeArtista(parte) === artista);
  let mix = fonte.mix ?? null;
  let musicas = fonte.musicas ?? [];
  let sementes = (fonte.faixas ?? []).filter(dele);
  if (!mix || !musicas.length) {
    // Na pesquisa vem o canal escolhido: a página é a DESSE (sem adivinhar).
    if (fonte.canal) lembrarCanalDoArtista(nome, fonte.canal);
    // O botão já pode ser usado no primeiro frame, antes da biblioteca chegar.
    if (!sementes.length && !fonte.canal) {
      const biblioteca = await lerFaixas(getLibrary);
      if (!aindaVale()) return true;
      sementes = gruposDaBiblioteca(biblioteca).find(g => g.chave === artista)?.faixas ?? [];
    }
    const pagina = await paginaDoArtista(nome, sementes);
    if (!aindaVale()) return true;
    mix ??= pagina.mix;
    if (!musicas.length) musicas = pagina.musicas;
    if (!sementes.length) sementes = pagina.musicas.filter(dele);
  }
  let radio = mix ? await lerRadioPeloYtMusic(mix) : [];
  if (!aindaVale()) return true;
  if (!radio.length && sementes.length) {
    // Sem o rádio do canal, as parecidas vêm das faixas dele. 'session' impede
    // o fallback global do Flow de trocar o artista escolhido.
    radio = await fetchRadioTracks(sementes.slice(0, 3), [], 50, new Set(), 'session');
    if (!aindaVale()) return true;
  }
  const faixas = montarMixDoArtista(musicas, radio, dele, chavesDaMusica, Math.random);
  if (!faixas.length) return false;
  await usePlayer.getState().tocarLista(faixas, false, false, { tipo: 'prateleira', nome: `${nome} Mix` });
  return true;
}
