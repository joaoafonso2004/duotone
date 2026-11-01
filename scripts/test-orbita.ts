/**
 * A Órbita (C4 da auditoria de 31/10; fecha o A2): pôr na fila, a tocar a
 * seguir ou nas Liked Songs pelo menu de uma música faz a capa voar para onde a
 * música foi, nas duas plataformas. As contas são puras (`lib/orbita.ts`); a
 * ligação lê-se como TEXTO.
 *
 * Correr: node --experimental-strip-types scripts/test-orbita.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  destinoNoIphone, fraseDaOrbita, ouvirOrbita, pedirOrbita, SUBIDA_MINIMA, VOO_MS, vooEmArco,
} from '../src/lib/orbita.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

console.log('\nas frases (duas, onde havia cinco)');
caso('"Added to queue" e "Playing next", com o título', () => {
  assert.equal(fraseDaOrbita('fila', 'Night Engine'), 'Added to queue · Night Engine');
  assert.equal(fraseDaOrbita('seguinte', 'Night Engine'), 'Playing next · Night Engine');
  assert.equal(fraseDaOrbita('guardar', 'X'), 'Added to Liked Songs · X');
  assert.equal(fraseDaOrbita('fila', ''), 'Added to queue');
});
caso('as frases velhas saíram', () => {
  for (const f of ['src/navigation/RootNavigator.web.tsx', 'src/desktop/MenuDoAmigo.web.tsx', 'src/components/MenuDaMensagem.web.tsx', 'src/desktop/alvosDeLargar.web.ts']) {
    assert.ok(!/added to the queue|Added to the queue|'Added to queue\.'|Will play next/.test(ler(f)), f);
  }
});

console.log('\no arco');
const de = { x: 300, y: 400, width: 40, height: 40 };
caso('sobe acima dos dois e cai no destino', () => {
  const v = vooEmArco(de, { x: 20, y: 700, width: 48, height: 48 }, 'seguinte');
  assert.equal(v.dx, 44 - 320);
  assert.equal(v.dy, 724 - 420);
  assert.ok(v.pico < 0 && v.pico <= -SUBIDA_MINIMA, String(v.pico));
  assert.equal(v.duracao, VOO_MS.seguinte);
});
caso('para cima, o ponto mais alto passa acima do destino', () => {
  const v = vooEmArco(de, { x: 20, y: 40, width: 32, height: 32 }, 'guardar');
  assert.ok(v.pico < v.dy, `${v.pico} < ${v.dy}`);
});
caso('o y é uma parábola: começa em 0, toca o pico uma vez a meio do voo e acaba no destino', () => {
  for (const para of [{ x: 20, y: 700, width: 48, height: 48 }, { x: 20, y: 40, width: 32, height: 32 }, { x: 600, y: 410, width: 40, height: 40 }]) {
    const v = vooEmArco(de, para, 'fila');
    assert.equal(v.arco[0].y, 0);
    assert.equal(v.arco[v.arco.length - 1].y, v.dy);
    assert.ok(v.topoEm > 0.05 && v.topoEm < 0.95, `topo a ${v.topoEm}`);
    // No topo a parábola vale o pico (a conta, não os pontos amostrados).
    const A = (v.dy - 2 * v.pico) + 2 * Math.sqrt(v.pico * (v.pico - v.dy));
    const y = A * v.topoEm ** 2 + (v.dy - A) * v.topoEm;
    assert.ok(Math.abs(y - v.pico) < 1e-6, `${y} vs ${v.pico}`);
    // Sobe sempre até ao topo e desce sempre depois (sem ficar parado lá em cima).
    const k = v.arco.findIndex((p) => p.t >= v.topoEm);
    for (let i = 1; i < k; i++) assert.ok(v.arco[i].y < v.arco[i - 1].y, `sobe em ${i}`);
    for (let i = k + 1; i < v.arco.length; i++) assert.ok(v.arco[i].y > v.arco[i - 1].y, `desce em ${i}`);
  }
});
caso('pousa com o tamanho do destino', () => {
  const v = vooEmArco(de, { x: 0, y: 0, width: 48, height: 48 }, 'fila');
  assert.ok(Math.abs(v.escalaFinal - (48 * 0.62) / 44) < 1e-9);
});

console.log('\nos destinos no iPhone (das medidas da base, sem medir o mini)');
const m = { largura: 390, altura: 844, fundoSeguro: 34, separadores: 54, zonaDaMusica: 72, modo: 'separadores' as const, temMusica: true };
caso('a seguir: a capa do mini, por cima dos separadores', () => {
  assert.deepEqual(destinoNoIphone('seguinte', m), { x: 20, y: 844 - 34 - 54 - 72 + 8, width: 48, height: 48 });
});
caso('guardar: o separador Songs (o segundo de quatro)', () => {
  const r = destinoNoIphone('guardar', m)!;
  assert.equal(r.x + r.width / 2, 390 / 4 * 1.5);
});
caso('sem música não há mini, e com a base escondida não há destino', () => {
  assert.equal(destinoNoIphone('fila', { ...m, temMusica: false }), null);
  assert.equal(destinoNoIphone('fila', { ...m, modo: 'escondida' }), null);
  assert.equal(destinoNoIphone('guardar', { ...m, modo: 'semSeparadores' }), null);
});
caso('o pedido: sem camada à escuta, false; com ela, o que ela disser', () => {
  assert.equal(pedirOrbita({ destino: 'fila', titulo: 'x' }), false);
  const largar = ouvirOrbita(() => true);
  assert.equal(pedirOrbita({ destino: 'fila', titulo: 'x' }), true);
  largar();
  assert.equal(pedirOrbita({ destino: 'fila', titulo: 'x' }), false);
});

console.log('\no iPhone');
const camada = ler('src/components/CamadaDaOrbita.tsx');
caso('o menu de uma música pede a Órbita (era mudo, A2)', () => {
  const menu = ler('src/components/TrackActionsSheet.tsx');
  assert.match(menu, /case 'por-na-fila': player\.addToQueue\(t\); pedirOrbita\(\{ destino: 'fila'/);
  assert.match(menu, /case 'tocar-a-seguir': player\.playNext\(t\); pedirOrbita\(\{ destino: 'seguinte'/);
  assert.match(menu, /if \(ficou && !pedirOrbita\(\{ destino: 'guardar'/);
});
caso('a camada está na raiz, por cima do mini, e não lhe mexe', () => {
  assert.match(ler('src/navigation/RootNavigator.tsx'), /<PlayerRoot \/>[\s\S]*<CamadaDaOrbita \/>/);
  assert.ok(!/PlayerRoot|MiniPlayer/.test(camada.replace(/\/\*[\s\S]*?\*\//g, '')), 'não importa nada do leitor');
  assert.match(camada, /pointerEvents="none"/);
});
caso('só transform e opacidade, no driver nativo, com a fluidez pedida', () => {
  const animados = [...camada.matchAll(/Animated\.(?:timing|spring)\(\w+, \{[^}]*\}/g)].map((x) => x[0]);
  assert.ok(animados.length >= 5);
  for (const a of animados) assert.match(a, /useNativeDriver: true/, a);
  assert.match(camada, /pedirFluidez\(/);
  assert.ok(!/Animated\.parallel/.test(camada.replace(/\/\/.*$/gm, '')), 'cada valor anda sozinho');
});
caso('com menos movimento não voa (só o anel), e o VoiceOver ouve a frase', () => {
  assert.match(camada, /isReduceMotionEnabled/);
  assert.match(camada, /announceForAccessibility\(fraseDaOrbita\(/);
});

console.log('\no PC');
const raiz = ler('src/navigation/RootNavigator.web.tsx');
caso('o menu voa para a fila, para a barra e para as Liked Songs; sem voo, a frase', () => {
  assert.match(raiz, /if \(!orbitar\('fila', t\.artworkUrl\)\) notify\(fraseDaOrbita\('fila', tituloDaFaixa\(t\)\)\)/);
  assert.match(raiz, /if \(!orbitar\('seguinte', t\.artworkUrl\)\) notify\(fraseDaOrbita\('seguinte', tituloDaFaixa\(t\)\)\)/);
  assert.match(raiz, /if \(!orbitar\('guardar', trackMenu\.artworkUrl\)\) notify\(fraseDaOrbita\('guardar'/);
  assert.match(raiz, /useEffect\(\(\) => ouvirOrigemDaOrbita\(\), \[\]\);/);
});
caso('os destinos estão marcados: a capa da barra e as Liked Songs da lateral', () => {
  const casca = ler('src/desktop/casca.web.tsx');
  assert.match(casca, /<View nativeID="alvo-seguinte"><Artwork track=\{mostrada \?\? p\.current\} size=\{52\} \/><\/View>/);
  assert.match(casca, /marcar\('premir', \.\.\.\(id \? \[`nav-\$\{id\}`\] : \[\]\)\)/);
  const orbita = ler('src/desktop/Orbita.web.ts');
  for (const alvo of ['#seta-do-painel-do-leitor', '#aba-do-leitor-fila', '#alvo-seguinte', '[data-dt~="nav-songs"]']) {
    assert.ok(orbita.includes(alvo), alvo);
  }
  assert.match(ler('src/desktop/PainelDoLeitor.web.tsx'), /const ID_DA_SETA = 'seta-do-painel-do-leitor';/);
  assert.match(ler('src/desktop/PainelDoLeitor.web.tsx'), /nativeID=\{`aba-do-leitor-\$\{aba\}`\}/);
});
caso('no PC também: com menos movimento não voa, o disco cresce com a mola e o y segue a parábola', () => {
  const orbita = ler('src/desktop/Orbita.web.ts');
  assert.match(orbita, /prefers-reduced-motion: reduce/);
  assert.match(orbita, /curvaDoPc\('entrada'\)/);
  assert.match(orbita, /v\.arco\.map/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
