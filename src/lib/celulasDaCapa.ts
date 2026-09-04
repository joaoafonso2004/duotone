import { Image } from 'expo-image';
import { celulasDoBlurhash, type RGB } from './corDaCapa';
import { amostrarCapaNativa } from '../../modules/duotone-remote-commands';

/**
 * Ler a cor de uma capa no telemóvel.
 *
 * Tem de dar o MESMO que o lado do PC (celulasDaCapa.web.ts), que desenha a
 * capa em 4x4 num `canvas` e lê as dezasseis médias. É por isso que o caminho
 * principal aqui é o módulo nativo, que faz exactamente o mesmo desenho com
 * CoreGraphics.
 *
 * O blurhash fica como recurso, e só como recurso. Ele NÃO é a capa reduzida:
 * é uma reconstrução por cossenos, oscila, e inventa cores que a foto não tem.
 * Como quem escolhe o tom fica com a célula mais saturada (ver
 * corCaracteristica), bastava um artefacto para uma fotografia castanha tingir
 * o perfil de roxo -- e para a mesma capa dar tons diferentes no telemóvel e no
 * PC, que foi o que se andou a ver.
 *
 * Nunca lança: uma capa que não carrega vale o mesmo que uma capa que não
 * existe, e quem chama já sabe cair no tema fixo.
 */
export async function lerCelulasDaCapa(uri: string | null | undefined): Promise<RGB[] | null> {
  if (!uri) return null;

  try {
    const valores = await amostrarCapaNativa(uri, 4, 4);
    if (valores) {
      const celulas: RGB[] = [];
      for (let i = 0; i + 2 < valores.length; i += 3) {
        celulas.push({ r: valores[i]!, g: valores[i + 1]!, b: valores[i + 2]! });
      }
      if (celulas.length) return celulas;
    }
  } catch {
    // Sem módulo nativo, ou capa que não respondeu: segue para o blurhash.
  }

  try {
    const hash = await Image.generateBlurhashAsync(uri, [4, 4]);
    return hash ? celulasDoBlurhash(hash, 4, 4) : null;
  } catch {
    return null;
  }
}
