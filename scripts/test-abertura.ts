/**
 * A abertura: o ficheiro e o código têm de concordar.
 *
 * A animação vive dentro do `assets/abertura.webp` e quem decide quando ela
 * sai é um temporizador em `components/Abertura.tsx`, com os tempos de
 * `lib/abertura.ts`. Nada liga os dois a não ser este teste. Lê os blocos do
 * WebP (RIFF) diretamente -- sem biblioteca de imagem -- e confirma o que a app
 * assume sobre ele.
 */
import { readFileSync } from 'node:fs';
import { ABERTURA, PORTAL, escalaParaAbrir } from '../src/lib/abertura.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const b = readFileSync(new URL('../assets/abertura.webp', import.meta.url));
const u24 = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

let flags = 0;
let largura = 0;
let altura = 0;
let loop = -1;
const duracoes: number[] = [];
for (let i = 12; i + 8 <= b.length;) {
  const tag = b.toString('latin1', i, i + 4);
  const n = b.readUInt32LE(i + 4);
  const d = i + 8;
  if (tag === 'VP8X') { flags = b[d]; largura = u24(d + 4) + 1; altura = u24(d + 7) + 1; }
  if (tag === 'ANIM') loop = b.readUInt16LE(d + 4);
  if (tag === 'ANMF') duracoes.push(u24(d + 12));
  i = d + n + (n & 1);
}
const ultimo = duracoes.at(-1) ?? 0;
const animacao = duracoes.slice(0, -1).reduce((a, x) => a + x, 0);

check('é um WebP', b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP');
check('é animado', (flags & 0x02) !== 0 && duracoes.length > 30, `${duracoes.length} fotogramas`);
// Sem alfa via-se o quadrado da imagem por cima do fundo da app.
check('tem transparência', (flags & 0x10) !== 0);
check('é quadrado de 720', largura === 720 && altura === 720, `${largura}x${altura}`);
// O `loop` do WebP é o número de voltas; 0 seria para sempre.
check('toca uma vez', loop === 1, `loop = ${loop}`);
// O último fotograma muda pela última vez aqui. Tem de ser antes de a app
// sair, senão corta-se o reflexo -- e não muito antes, senão sobra um logo
// parado a fazer esperar quem abriu a app.
check('a animação cabe no tempo da app', animacao <= ABERTURA.animacaoMs, `${animacao} ms`);
check('e não sobra muito tempo parado', animacao >= ABERTURA.animacaoMs - 150, `${animacao} ms`);
// Se algum leitor ignorasse o loop, o recomeço ficava depois do teto.
check('o fim fica parado para lá do teto', ultimo >= ABERTURA.tetoMs + ABERTURA.saidaMs, `${ultimo} ms`);
check('não pesa mais de 1,5 MB', b.length <= 1.5 * 1024 * 1024, `${(b.length / 1024).toFixed(0)} KB`);
check('a abertura sai antes do teto', ABERTURA.animacaoMs + ABERTURA.seguraMs < ABERTURA.tetoMs);


// ---------------------------------------------------------------- portal ---
//
// A saida: o logo vem na direcao do ecra e a app aparece pelo vazio do meio.
// O ficheiro e gerado pelo `scripts/gerar-portal-da-abertura.py`, que mede o
// buraco e compara-o com o `PORTAL` daqui (`--verificar`). Aqui prende-se o
// resto: que o ficheiro existe, tem o mesmo tamanho do WebP, e que a conta da
// ampliacao chega mesmo para tapar ecras de varios formatos.
const portal = readFileSync(new URL('../assets/abertura-portal.png', import.meta.url));
const ehPng = portal.toString('latin1', 1, 4) === 'PNG';
check('o portal e um PNG', ehPng);
const larguraPng = ehPng ? portal.readUInt32BE(16) : 0;
const alturaPng = ehPng ? portal.readUInt32BE(20) : 0;
check('e quadrado de 720, como o WebP', larguraPng === 720 && alturaPng === 720, `${larguraPng}x${alturaPng}`);
check('tem alfa (senao nao ha vazio nenhum)', ehPng && portal[25] === 6, `tipo de cor ${portal[25]}`);

// Quatro formatos: monitor, ultrawide, telemovel ao alto e janela pequena.
for (const [largura, altura, lado] of [
  [1920, 1080, 320], [3440, 1440, 320], [393, 852, 236], [900, 600, 320],
] as const) {
  const escala = escalaParaAbrir(largura, altura, lado);
  const buracoLargura = lado * PORTAL.larguraDoBuraco * escala;
  const buracoAltura = lado * PORTAL.alturaDoBuraco * escala;
  check(
    `a ${largura}x${altura} o vazio passa as bordas`,
    buracoLargura >= largura && buracoAltura >= altura,
    `${escala.toFixed(1)}x -> ${buracoLargura.toFixed(0)}x${buracoAltura.toFixed(0)}`,
  );
}
check('num ecra maior e preciso crescer mais', escalaParaAbrir(3840, 2160, 320) > escalaParaAbrir(1280, 720, 320));
// Sem tamanho nao se inventa: 1x e nao NaN nem Infinity.
check('medidas impossiveis nao dao NaN', escalaParaAbrir(0, 0, 0) === 1 && Number.isFinite(escalaParaAbrir(-5, 100, 320)));
// O retangulo la de cima nao e a verdade toda: o vazio e uma LENTE, afunila nas
// pontas, e os CANTOS do ecra sao os ultimos a abrir. Aqui trata-se a lente
// como uma elipse com a mesma caixa (optimista -- a lente e mais estreita nas
// pontas), ja com o giro aplicado, e exige-se que os quatro cantos caiam
// dentro dela. A folga verdadeira foi medida no proprio ficheiro: 1,46 sem
// giro e 1,70 com os 16 graus, no pior caso (iPhone ao alto). E por isso que
// ela e 1,8 e nao 1,12, que era o que estava e deixava metal nos cantos no
// ultimo fotograma.
for (const [largura, altura, lado] of [
  [1920, 1080, 320], [3440, 1440, 320], [393, 852, 236], [900, 600, 320],
] as const) {
  const escala = escalaParaAbrir(largura, altura, lado);
  const a = (lado * PORTAL.larguraDoBuraco * escala) / 2;
  const b = (lado * PORTAL.alturaDoBuraco * escala) / 2;
  const t = (PORTAL.giroGraus * Math.PI) / 180;
  const x = largura / 2;
  const y = altura / 2;
  const u = x * Math.cos(t) + y * Math.sin(t);
  const v = -x * Math.sin(t) + y * Math.cos(t);
  const dentro = (u / a) ** 2 + (v / b) ** 2;
  check(
    `a ${largura}x${altura} o canto do ecra fica dentro do vazio rodado`,
    dentro <= 1,
    `${dentro.toFixed(2)} do raio (1,00 = a encostar)`,
  );
}
// A app aparece AO LONGO da ida, e nao de uma vez no fim.
//
// As tiras do veu vivem dentro do quadrado que cresce, por isso o que se ve da
// app e sempre o que ja passou pelo vazio -- e o vazio comeca a abrir no
// primeiro fotograma da saida. O que este teste prende e que a fracao do ecra
// aberta nunca desce, que ja ha ecra aberto no principio, e que no fim esta
// TODO aberto: se nao estivesse, a camada a desaparecer libertava o resto num
// fotograma, que foi como isto se portava com as tiras paradas no ecra.
const easeInQuad = (t: number) => t * t;
function reveladoEm(largura: number, altura: number, lado: number, p: number): number {
  const escala = 1 + (escalaParaAbrir(largura, altura, lado) - 1) * easeInQuad(p);
  const aberto = Math.min(1, (lado * PORTAL.larguraDoBuraco * escala) / largura);
  const alto = Math.min(1, (lado * PORTAL.alturaDoBuraco * escala) / altura);
  return aberto * alto;
}
for (const [largura, altura, lado] of [[1920, 1080, 320], [393, 852, 236]] as const) {
  let anterior = -1;
  let desceu = false;
  for (let i = 0; i <= 20; i++) {
    const agora = reveladoEm(largura, altura, lado, i / 20);
    if (agora < anterior - 1e-9) desceu = true;
    anterior = agora;
  }
  const inicio = reveladoEm(largura, altura, lado, 0);
  const meio = reveladoEm(largura, altura, lado, 0.6);
  const fim = reveladoEm(largura, altura, lado, 1);
  check(`a ${largura}x${altura} a app aparece aos poucos`, !desceu && inicio > 0 && meio > 0.25,
    `${(inicio * 100).toFixed(1)}% no inicio, ${(meio * 100).toFixed(0)}% a 60%`);
  check(`a ${largura}x${altura} no fim nao sobra ecra para libertar`, fim >= 1,
    `${(fim * 100).toFixed(0)}% aberto quando a camada sai`);
}
check('a folga paga a lente e o giro', PORTAL.folga >= 1.7 && PORTAL.folga < 2.5, `${PORTAL.folga}`);
check('o giro ve-se mas nao rebola', PORTAL.giroGraus > 5 && PORTAL.giroGraus <= 20, `${PORTAL.giroGraus} graus`);
// A dissolucao tem de caber na ida, senao o WebP ainda esta la quando acaba.
check(
  'o WebP sai dentro da ida ao ecra',
  PORTAL.desvanecerMs > 0 && PORTAL.desvanecerMs < PORTAL.zoomMs / 2,
  `${PORTAL.desvanecerMs} ms de ${PORTAL.zoomMs} ms`,
);
// A saida nao pode durar mais do que a propria animacao: quem abre a app quer
// e chegar la.
check('a ida ao ecra e curta', PORTAL.zoomMs > 200 && PORTAL.zoomMs <= ABERTURA.animacaoMs, `${PORTAL.zoomMs} ms`);

console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
process.exit(bad ? 1 : 0);