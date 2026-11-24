import qrcode from 'qrcode-generator';

/**
 * O QR desenhado no aparelho (24/11). Era pedido ao api.qrserver.com, que
 * recebia o link da playlist e sem rede não mostrava nada. O `qrcode-generator`
 * é só JavaScript, sem dependências, e dá a matriz; quem a desenha é a
 * `components/QrDoDuotone.tsx`, com uma `View` por cada risco escuro de uma
 * linha (a app não tem SVG).
 *
 * Nível Q (25 % de correção): a capa no meio tapa menos do que isso.
 * `scripts/test-qr-da-playlist.ts`.
 */

export type MatrizDoQr = readonly (readonly boolean[])[];

export function matrizDoQr(texto: string): MatrizDoQr {
  const qr = qrcode(0, 'Q');
  qr.addData(texto, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, linha) => Array.from({ length: n }, (__, coluna) => qr.isDark(linha, coluna)));
}

/** Os riscos escuros de uma linha: onde começam e quantos módulos têm. */
export function riscosDaLinha(linha: readonly boolean[]): [number, number][] {
  const riscos: [number, number][] = [];
  let inicio = -1;
  for (let i = 0; i <= linha.length; i++) {
    const escuro = i < linha.length && linha[i];
    if (escuro && inicio < 0) inicio = i;
    else if (!escuro && inicio >= 0) { riscos.push([inicio, i - inicio]); inicio = -1; }
  }
  return riscos;
}

/**
 * Os módulos do meio que a capa tapa: um quadrado ímpar à volta do centro, com
 * no máximo ~8 % da área (o nível Q aguenta 25 %).
 */
export function ladoDoCentro(n: number): number {
  const lado = Math.floor(Math.sqrt(n * n * 0.08));
  return lado % 2 === 1 ? lado : lado - 1;
}
