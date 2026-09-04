/**
 * A cor da capa: determinismo, contraste e recurso.
 *
 * São as exigências que o plano fixou, e cada uma tem aqui um caso. A quarta
 * -- a transição não ser um salto -- é de quem consome, não deste módulo.
 */
import { semOpacidade } from '../src/lib/corDaCapa.ts';
import {
  celulasDoBlurhash,
  contraste,
  deHex,
  misturar,
  misturarTemas,
  corCaracteristica,
  FUNDO,
  garantirContraste,
  luminancia,
  saturacao,
  temaDaCapa,
  veuDaCapa,
  type RGB,
} from '../src/lib/corDaCapa.ts';
import { modoGuardado, STEEL } from '../src/lib/modoDoTema.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};

const rgb = (r: number, g: number, b: number): RGB => ({ r, g, b });

// --- Blurhash --------------------------------------------------------------
// Hashes do próprio exemplo da especificação do blurhash.
const HASH = 'LEHV6nWB2yk8pyo0adR*.7kCMdnj';

const celulas = celulasDoBlurhash(HASH, 4, 4);
check('descodifica um blurhash válido', !!celulas && celulas.length === 16, String(celulas?.length));
check('as células são cores válidas',
  !!celulas && celulas.every((c) => [c.r, c.g, c.b].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)));

// Determinismo: a mesma capa dá sempre a mesma cor. É a exigência nº1.
const outraVez = celulasDoBlurhash(HASH, 4, 4);
check('a mesma capa dá as mesmas células', JSON.stringify(celulas) === JSON.stringify(outraVez));
check('e o mesmo tema', JSON.stringify(temaDaCapa(celulas)) === JSON.stringify(temaDaCapa(outraVez)));

for (const invalido of ['', 'x', 'LEHV6nWB', '!!!!!!!!!!!!', 'LEHV6nWB2yk8pyo0adR*.7kCMdn']) {
  check(`hash inválido "${invalido.slice(0, 12)}" devolve null`, celulasDoBlurhash(invalido) === null);
}

// --- Contraste -------------------------------------------------------------
// Exigência nº2: a cor tem de se ler sobre o fundo preto da app.
const escuras: RGB[] = [rgb(20, 10, 40), rgb(5, 5, 5), rgb(40, 0, 0), rgb(10, 30, 10), rgb(0, 0, 60)];
for (const escura of escuras) {
  const subida = garantirContraste(escura);
  check(`cor escura ${JSON.stringify(escura)} passa a legível`,
    contraste(subida, FUNDO) >= 4.5, contraste(subida, FUNDO).toFixed(2));
}

// Uma cor que já se lê não deve ser mexida.
const clara = rgb(233, 234, 238);
check('cor já legível fica na mesma', JSON.stringify(garantirContraste(clara)) === JSON.stringify(clara));

// O tom mantém-se: clarear não pode transformar um vermelho num rosa qualquer.
const vermelhoEscuro = rgb(60, 0, 0);
const vermelhoClaro = garantirContraste(vermelhoEscuro);
check('clarear mantém o canal dominante',
  vermelhoClaro.r > vermelhoClaro.g && vermelhoClaro.r > vermelhoClaro.b,
  JSON.stringify(vermelhoClaro));

// --- Escolha da cor --------------------------------------------------------
const grelha: RGB[] = [rgb(30, 30, 32), rgb(200, 40, 40), rgb(35, 35, 38), rgb(28, 28, 30)];
const escolhida = corCaracteristica(grelha);
check('escolhe a célula com cor, não a cinzenta', escolhida?.r === 200, JSON.stringify(escolhida));

// Exigência nº3: sem cor para dar, o recurso.
const cinzentas: RGB[] = [rgb(20, 20, 20), rgb(128, 128, 128), rgb(200, 200, 201), rgb(60, 60, 60)];
check('capa a preto e branco não inventa cor', corCaracteristica(cinzentas) === null);
check('e o tema dela é null', temaDaCapa(cinzentas) === null);
check('sem células, null', temaDaCapa([]) === null && temaDaCapa(null) === null && temaDaCapa(undefined) === null);
check('o véu segue a mesma regra', veuDaCapa(cinzentas) === null && !!veuDaCapa(grelha));

// Entre dois vivos, ganha o que se vê melhor.
const doisVivos: RGB[] = [rgb(70, 0, 0), rgb(240, 80, 80)];
check('entre dois do mesmo tom, ganha o mais visível', corCaracteristica(doisVivos)?.r === 240);

// --- O tema que sai --------------------------------------------------------
const tema = temaDaCapa(grelha)!;
check('o tema tem o nome do modo', tema.name === 'cover', tema.name);
check('a cor é hexadecimal', /^#[0-9A-F]{6}$/.test(tema.color), tema.color);
check('o gradiente tem dois tons', tema.gradient.length === 2, tema.gradient.join(' '));
check('e os dois são diferentes', tema.gradient[0] !== tema.gradient[1]);
check('o soft é translúcido', tema.soft.startsWith('rgba(') && tema.soft.endsWith('0.16)'), tema.soft);

// O texto por cima do acento tem de se ler -- é outro contraste, contra a cor
// e não contra o fundo.
const paraRGB = (h: string): RGB => ({
  r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16),
});
for (const g of [
  [rgb(250, 240, 60)],           // amarelo claro -> pede texto escuro
  [rgb(20, 20, 160)],            // azul fundo -> pede texto claro
  [rgb(200, 40, 40)],
  [rgb(40, 200, 120)],
]) {
  const t = temaDaCapa(g)!;
  const razao = contraste(paraRGB(t.color), paraRGB(t.textColorOnGradient));
  check(`texto legível sobre ${t.color}`, razao >= 4.5, razao.toFixed(2) + ' com ' + t.textColorOnGradient);
}

// E a própria cor tem de se ler sobre o fundo da app, sempre.
for (let r = 0; r <= 255; r += 51) {
  for (let g = 0; g <= 255; g += 51) {
    for (let b = 0; b <= 255; b += 51) {
      const t = temaDaCapa([rgb(r, g, b)]);
      if (!t) continue; // cinzento: cai no recurso, e isso já foi testado
      const razao = contraste(paraRGB(t.color), FUNDO);
      if (razao < 4.5) {
        check(`contraste garantido para rgb(${r},${g},${b})`, false, razao.toFixed(2));
      }
    }
  }
}
check('contraste garantido em toda a gama de cores', true);

// --- Funções de apoio ------------------------------------------------------
check('luminância do preto é 0', luminancia(rgb(0, 0, 0)) === 0);
check('luminância do branco é 1', Math.abs(luminancia(rgb(255, 255, 255)) - 1) < 1e-9);
check('contraste preto/branco é 21', Math.abs(contraste(rgb(0, 0, 0), rgb(255, 255, 255)) - 21) < 0.01);
check('cinzento não tem saturação', saturacao(rgb(90, 90, 90)) === 0);
check('vermelho puro satura a 1', saturacao(rgb(255, 0, 0)) === 1);


// --- Transição -------------------------------------------------------------
// Exigência nº4: a mudança entre faixas é uma passagem, não um salto.
check('lê hexadecimal', JSON.stringify(deHex('#FF8000')) === JSON.stringify({ r: 255, g: 128, b: 0 }));
check('hexadecimal inválido dá preto', JSON.stringify(deHex('nao')) === JSON.stringify({ r: 0, g: 0, b: 0 }));

const A = rgb(255, 0, 0);
const B = rgb(0, 0, 255);
check('t=0 é a partida', JSON.stringify(misturar(A, B, 0)) === JSON.stringify(A));
check('t=1 é o destino', JSON.stringify(misturar(A, B, 1)) === JSON.stringify(B));
check('fora do intervalo fica preso às pontas',
  JSON.stringify(misturar(A, B, -3)) === JSON.stringify(A) && JSON.stringify(misturar(A, B, 9)) === JSON.stringify(B));

// A passagem tem de ser monótona: uma cor que avança e recua vê-se a tremer.
let anterior = -1;
let monotona = true;
for (let i = 0; i <= 10; i++) {
  const azul = misturar(A, B, i / 10).b;
  if (azul < anterior) monotona = false;
  anterior = azul;
}
check('a passagem avança sempre no mesmo sentido', monotona);

// Não passa por um cinzento sujo a meio -- era isto que a mistura linear evita.
const meio = misturar(A, B, 0.5);
check('o meio do caminho não é cinzento', saturacao(meio) > 0.5, JSON.stringify(meio));

const t0 = misturarTemas(STEEL, temaDaCapa([rgb(200, 40, 40)])!, 0);
const t1 = misturarTemas(STEEL, temaDaCapa([rgb(200, 40, 40)])!, 1);
check('a mistura de temas começa no steel', t0.color === STEEL.color, t0.color);
check('e acaba na cor da capa', t1.color === temaDaCapa([rgb(200, 40, 40)])!.color, t1.color);
check('o texto por cima nunca fica a meio tom',
  ['#0B0B0E', '#FFFFFF'].includes(misturarTemas(STEEL, t1, 0.5).textColorOnGradient));

// --- Migração --------------------------------------------------------------
// Exigência do plano: quem tinha uma das cores que desapareceram não pode
// ficar sem acento nenhum.
for (const antiga of ['violet', 'blue', 'orange', 'green', 'pink', 'red', 'mono', 'lilás', '', null, undefined]) {
  check(`"${antiga}" passa a steel`, modoGuardado(antiga as any) === 'steel');
}
check('steel continua steel', modoGuardado('steel') === 'steel');
check('cover é respeitado', modoGuardado('cover') === 'cover');

// --- O véu tem de poder desaparecer sem passar pelo preto ---


// O que `veuDaCapa` produz mantém o tom e perde a opacidade.
if (semOpacidade('rgba(120,160,90,0.14)') !== 'rgba(120,160,90,0)')
  throw new Error('véu sem opacidade tem de manter o tom');
if (semOpacidade('rgb(12, 34, 56)') !== 'rgba(12,34,56,0)')
  throw new Error('rgb sem alfa também tem de servir');
// Nada de aproveitável não pode devolver uma cor a sério.
for (const mau of ['#FFFFFF', '', 'rgba(1,2)', 'seja o que for'])
  if (semOpacidade(mau) !== 'rgba(0,0,0,0)')
    throw new Error(`entrada inválida devia dar transparente: ${mau}`);

console.log('Véu: perde a opacidade sem perder o tom.');

console.log(mau ? `\n  ${mau} falha(s)` : '\n  Todos os casos passaram.');
process.exit(mau ? 1 : 0);