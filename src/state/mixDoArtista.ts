import { mixDoArtista } from '../api/albunsDoArtista';
import { lerRadioPeloYtMusic } from '../api/ytMusic';
import type { MixDoArtista } from '../lib/albunsDoArtista';
import { novaEscolha } from '../lib/ultimaEscolha';
import { usePlayer } from './player';

/**
 * Toca o Mix de um artista (29/9): o botão "Mix" da página dele e do artista
 * em destaque na pesquisa, nas duas plataformas. O Mix vem da página do
 * artista (`paginaDoArtista`) ou, na pesquisa, do canal que ela trouxe.
 * Devolve `false` se o artista não tem Mix ou ele não se leu -- quem chama diz.
 *
 * O último toque ganha (2/10, lib/ultimaEscolha.ts): o Mix espera pela rede, e
 * se entretanto se escolheu outra música (ou outro Mix) não toca. Aí devolve
 * `true`: não falhou nada, e não há aviso a dar.
 */
export async function tocarMixDoArtista(
  nome: string, fonte: { mix?: MixDoArtista | null; canal?: string | null },
): Promise<boolean> {
  const aindaVale = novaEscolha();
  const mix = fonte.mix ?? (fonte.canal ? await mixDoArtista(fonte.canal) : null);
  if (!aindaVale()) return true;
  if (!mix) return false;
  const faixas = await lerRadioPeloYtMusic(mix);
  if (!aindaVale()) return true;
  if (!faixas.length) return false;
  await usePlayer.getState().tocarLista(faixas, false, false, { tipo: 'prateleira', nome: `${nome} Mix` });
  return true;
}
