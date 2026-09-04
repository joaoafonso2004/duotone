import { Image } from 'expo-image';
import { celulasDoBlurhash, type RGB } from './corDaCapa';

/**
 * Ler a cor de uma capa no telemóvel.
 *
 * O React Native não dá acesso aos pixéis de uma imagem, e trazer o JPEG para
 * dentro do JavaScript para o descodificar à mão custava uma biblioteca nova e
 * uns tantos milissegundos por faixa.
 *
 * O `expo-image` já sabe gerar um blurhash, e o blurhash É a capa reduzida à
 * sua cor: a descodificação pesada acontece em código nativo, e o que atravessa
 * a ponte são umas dezenas de caracteres. Pedimos 4x4 componentes porque uma
 * só daria a média -- e a média de uma capa colorida é castanho.
 *
 * Nunca lança: uma capa que não carrega vale o mesmo que uma capa que não
 * existe, e quem chama já sabe cair no tema fixo.
 */
export async function lerCelulasDaCapa(uri: string | null | undefined): Promise<RGB[] | null> {
  if (!uri) return null;
  try {
    const hash = await Image.generateBlurhashAsync(uri, [4, 4]);
    return hash ? celulasDoBlurhash(hash, 4, 4) : null;
  } catch {
    return null;
  }
}
