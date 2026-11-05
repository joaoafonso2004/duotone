/**
 * As Duas luas (C9 da auditoria de 31/10): a passagem a ver-se, no AutoMix ou no
 * crossfade. As contas são puras (`lib/duasLuas.ts`), com planos a sério do
 * `planoDoAutomix`; a ligação aos motores e aos leitores lê-se como TEXTO.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-duas-luas.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  anelDaPassagem, automixAVista, duracaoDasLuas, legendaDaPassagem, LUAS, luaNoInstante, passagemAindaVale, trocaDaPassagem,
} from '../src/lib/duasLuas.ts';
import type { CurvaDaPassagem, PlanoDoAutomix, Pontos } from '../src/lib/automix.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

const zero: Pontos = [[0, 0]];
function curva(gravesSai: Pontos, gravesEntra: Pontos): CurvaDaPassagem {
  return { volSai: zero, volEntra: zero, gravesSai, gravesEntra, mediosSai: zero, mediosEntra: zero, agudosSai: zero, agudosEntra: zero };
}
function plano(o: Partial<PlanoDoAutomix> = {}): PlanoDoAutomix {
  return {
    tipo: 'batida', inicioS: 180, entraEmS: 4, duracaoS: 8,
    curva: curva([[0, 0], [4, 0], [4.001, -20]], [[0, -20], [4, -20], [4.001, 0]]),
    bpmSai: 124.2, bpmEntra: 127.8, confianca: 6, confiancaSai: 6, confiancaEntra: 7,
    tomSai: '8A', tomEntra: '9A', semitons: 0, acertoEntra: 1, motivo: '', ...o,
  };
}

console.log('\nas duas luas');
caso('a que sai começa no sítio, e acaba atrás, à esquerda e escurecida', () => {
  assert.deepEqual(luaNoInstante('sai', 0), { x: -0, escala: 1, sombra: 0, opacidade: 1 });
  const fim = luaNoInstante('sai', 1);
  assert.equal(fim.x, -LUAS.deslocacao);
  assert.equal(fim.escala, LUAS.escala);
  assert.equal(fim.sombra, LUAS.sombra);
});
caso('a que entra nasce por trás, à direita e escurecida, e acaba no sítio', () => {
  const inicio = luaNoInstante('entra', 0);
  assert.equal(inicio.x, LUAS.deslocacao);
  assert.equal(inicio.escala, LUAS.escala);
  assert.equal(inicio.sombra, LUAS.sombra);
  assert.equal(inicio.opacidade, 0);
  assert.equal(luaNoInstante('entra', LUAS.nascer).opacidade, 1);
  const fim = luaNoInstante('entra', 1);
  assert.equal(fim.x, 0);
  assert.equal(fim.escala, 1);
  assert.equal(fim.sombra, 0);
});
caso('é linear, como o volume, e não sai dos limites', () => {
  assert.ok(Math.abs(luaNoInstante('sai', 0.5).x - -LUAS.deslocacao / 2) < 1e-9);
  assert.equal(luaNoInstante('sai', 2).x, -LUAS.deslocacao);
  assert.equal(luaNoInstante('entra', -1).opacidade, 0);
});
caso('um corte de meio segundo vê-se na mesma; uma passagem longa dura o que dura', () => {
  assert.equal(duracaoDasLuas(500), LUAS.minimoMs);
  assert.equal(duracaoDasLuas(6000), 6000);
});
caso('uma passagem que já acabou não volta a abrir com o leitor', () => {
  assert.equal(passagemAindaVale({ comecaEm: 1000, duracaoMs: 6000 }, 6999), true);
  assert.equal(passagemAindaVale({ comecaEm: 1000, duracaoMs: 6000 }, 7000), false);
});

console.log('\no que só o AutoMix sabe');
caso('a legenda, arredondada', () => {
  assert.equal(legendaDaPassagem(plano()), '124 → 128 BPM · 8A → 9A');
});
caso('só com o que se sabe', () => {
  assert.equal(legendaDaPassagem(plano({ tomSai: null })), '124 → 128 BPM');
  assert.equal(legendaDaPassagem(plano({ bpmEntra: null })), '8A → 9A');
  assert.equal(legendaDaPassagem(plano({ bpmSai: null, tomEntra: null })), null);
});
caso('no suave a batida não é clara: fica só a tonalidade', () => {
  assert.equal(legendaDaPassagem(plano({ tipo: 'suave' })), '8A → 9A');
  assert.equal(legendaDaPassagem(plano({ tipo: 'suave', tomSai: null })), null);
});
caso('o anel só na passagem na batida, com as batidas contadas', () => {
  const a = anelDaPassagem(plano({ bpmSai: 120, duracaoS: 8 }))!;
  assert.equal(a.batidaMs, 500);
  assert.equal(a.batidas, 16);
  for (const tipo of ['por-cima', 'cauda', 'corte', 'suave'] as const) assert.equal(anelDaPassagem(plano({ tipo })), null, tipo);
  assert.equal(anelDaPassagem(plano({ bpmSai: null })), null);
});
caso('as luas trocam quando os graves trocam', () => {
  assert.ok(Math.abs(trocaDaPassagem(plano()) - 0.5) < 0.03, String(trocaDaPassagem(plano())));
  const noFim = plano({ curva: curva([[0, 0], [6, 0], [6.001, -20]], [[0, -20], [6, -20], [6.001, 0]]) });
  assert.equal(trocaDaPassagem(noFim), 0.75, 'nunca colada à ponta');
  const corte = plano({ tipo: 'corte', duracaoS: 0.5, curva: curva([[-2, 0], [0, -20]], [[0, 0]]) });
  assert.equal(trocaDaPassagem(corte), 0.25, 'nunca colada à ponta');
});
caso('sem nada que diga onde, a meio', () => {
  assert.equal(trocaDaPassagem(plano({ curva: curva([[0, 0]], [[0, -20]]) })), 0.5);
});
caso('junta as três', () => {
  const v = automixAVista(plano());
  assert.equal(v.legenda, '124 → 128 BPM · 8A → 9A');
  assert.equal(v.anel?.batidas, Math.round(8000 / (60_000 / 124.2)));
  assert.ok(v.trocaEm > 0.4 && v.trocaEm < 0.6);
});

console.log('\nos motores');
const motor = ler('src/components/YouTubePlayerView.tsx');
const motorPc = ler('src/components/YouTubePlayerView.web.tsx');
caso('o iPhone anuncia as duas passagens, e a do AutoMix só com a entrada marcada', () => {
  assert.equal((motor.match(/anunciarPassagem\(\{/g) ?? []).length, 2);
  assert.match(motor, /registarNaFila\(`\$\{track\.sourceId\}: automix scheduled[^\n]*\n[^\n]*\n\s+anunciarPassagem\(\{[\s\S]{0,400}automix: automixAVista\(plano\),/);
  assert.match(motor, /duracaoMs: \(passagemS\(st\) \* 1000\) \/ velocidadeQueToca\(\), automix: null \}\);/);
});
caso('o instante da passagem conta com a velocidade a que ela se ouve', () => {
  assert.match(motor, /comecaEm: Date\.now\(\) \+ \(Math\.max\(0, plano\.inicioS - player\.currentTime\) \* 1000\) \/ velocidadeQueToca\(\),/);
  assert.match(motor, /duracaoMs: \(plano\.duracaoS \* 1000\) \/ velocidadeQueToca\(\),/);
});
caso('uma passagem desfeita desfaz as luas, nas duas plataformas', () => {
  assert.match(motor, /const abortarPassagem = \(\) => \{\n\s+const p = passagemRef\.current;\n\s+if \(!p\) return;\n\s+reporEqDaPassagem\(p\);\n\s+desfazerPassagem\(\);/);
  assert.match(motorPc, /if \(passagemRef\.current\) desfazerPassagem\(\);/);
});
caso('o PC só tem crossfade: sem batida, graves nem legenda', () => {
  assert.match(motorPc, /anunciarPassagem\(\{[^\n]*automix: null \}\);/);
  assert.ok(!/automixAVista/.test(motorPc));
  assert.ok(!/legenda|anel/i.test(ler('src/desktop/DuasLuas.web.tsx').replace(/\/\*[\s\S]*?\*\//g, '')));
});
caso('o motor não mexe em mais nada: nem rede, nem um relógio novo', () => {
  const luas = ler('src/state/passagemAVista.ts');
  assert.ok(!/supabase|fetch\(|setInterval/.test(luas));
  assert.ok(!/setInterval/.test(ler('src/components/DuasLuas.tsx')));
});

console.log('\nno leitor do iPhone');
const luasIos = ler('src/components/DuasLuas.tsx');
const leitor = ler('src/components/PlayerRoot.tsx');
caso('o cubo fica montado por baixo, numa vista que não se achata', () => {
  assert.match(luasIos, /<View collapsable=\{false\} style=\{\[StyleSheet\.absoluteFill, cuboEscondido && styles\.escondido\]\}>\{children\}<\/View>/);
  assert.match(leitor, /<CapaComLuas size=\{size\}[^\n]*>\n\s+<ArtworkLyricsCube track=\{track\}/);
});
caso('só com o leitor aberto, a capa à frente e a app à vista', () => {
  assert.match(luasIos, /const podeVer = aVista && !letras && ativa;/);
  assert.match(luasIos, /AppState\.addEventListener\('change'/);
  assert.match(luasIos, /pointerEvents="none"/);
});
caso('tudo no motor nativo, e cada valor anda sozinho, com a fluidez pedida', () => {
  const animados = [...luasIos.matchAll(/Animated\.(?:timing|spring)\([^,]+, \{[^}]*\}/g)].map((x) => x[0]);
  assert.ok(animados.length >= 6, String(animados.length));
  for (const a of animados) assert.match(a, /useNativeDriver: true/, a);
  assert.ok(!/Animated\.parallel/.test(luasIos.replace(/\/\/.*$/gm, '')));
  assert.match(luasIos, /pedirFluidez\(resta \+ LUAS\.saida\.ms \+ LUAS\.entregaMs\);/);
});
caso('o recuo do skip não corre por baixo das luas', () => {
  assert.match(ler('src/components/CapaFlutuante3D.tsx'), /if \(!recuo \|\| !foreground \|\| !aVista \|\| luasNoEcra\(\)\) return;/);
});
caso('com menos movimento cruzam por opacidade, sem anéis nem reflexo, e a legenda fica', () => {
  assert.match(luasIos, /if \(reduzido\) \{\n\s+\/\/ Com menos movimento[^\n]*\n\s+return \{\n\s+sai: \{ opacity: v\.entrada, transform: comPose\(0, 1\) \}, entra: \{ opacity: v\.t, transform: comPose\(0, 1\) \},/);
  assert.match(luasIos, /if \(!aPassar \|\| !anel \|\| reduzido\) return;/);
  assert.ok(!/reduzido/.test(luasIos.slice(luasIos.indexOf('export function useLegendaDaPassagem'))));
});
caso('o anel forte cai no primeiro tempo forte, e a pausa pára as luas', () => {
  assert.match(luasIos, /const fraco = pulsar\(v\.pulso, 1, anel\.batidas - feitas\);/);
  assert.match(luasIos, /const forte = pulsar\(v\.forte, 4, /);
  assert.match(luasIos, /if \(!aPassar \|\| desfeita \|\| !aTocar\) return;/);
  assert.match(luasIos, /v\.t\.stopAnimation\(\(onde\) => \{ ondeIa\.current = onde; \}\);/);
});
caso('a capa nova só devolve o lugar ao cubo depois de a fila avançar, ou de esperar por ela', () => {
  assert.match(luasIos, /setTimeout\(\(\) => apagar\(LUAS\.apagarMs\), filaAvancou \? LUAS\.entregaMs : LUAS\.esperaPelaFilaMs\);/);
});
caso('a legenda não empurra o título: fica por cima dos pontos, escondidos', () => {
  assert.match(leitor, /!!legendaDaPassagem && styles\.pontoEscondido,/);
  assert.match(leitor, /\{legendaDaPassagem \? <LegendaDaPassagem texto=\{legendaDaPassagem\} \/> : null\}/);
  assert.match(luasIos, /legenda: \{\n\s+position: 'absolute'/);
  assert.match(luasIos, /fontVariant: \['tabular-nums'\]/);
});

caso('as luas de uma passagem antiga não acabam a cena da nova', () => {
  for (const f of ['src/components/DuasLuas.tsx', 'src/desktop/DuasLuas.web.tsx']) {
    const c = ler(f);
    assert.match(c, /if \(cena\.current\?\.id !== id\) return;/, f);
    assert.match(c, /aoAcabar\(p\.id\);/, f);
  }
});

console.log('\nno Now Playing do PC');
const luasPc = ler('src/desktop/DuasLuas.web.tsx');
const np = ler('src/desktop/paginas/NowPlayingPage.web.tsx');
caso('as luas ficam por cima, e a Ocultação não corre com elas', () => {
  // Com a capa de metal em 3D (5/11) nenhuma das duas corre: são camadas planas
  // sobre o quadrado da capa, e sobre a caixa inclinada ficavam desencontradas.
  assert.match(np, /<DuasLuas lado=\{ladoCapa\} capaDaQueSai=\{capaGrande\} ligada=\{!showLyrics && !capaMetal\} aoEsconderCubo=\{setCuboEscondido\} \/>/);
  assert.match(np, /ligada: !showLyrics && !luasNoEcra\(\) && !capaMetal,/);
});
caso('com as molas e sem curvas à mão', () => {
  assert.match(luasPc, /curvaDoPc\('sair'\)/);
  assert.ok(!/cubic-bezier|ease-/.test(luasPc));
});
caso('a pausa suspende as luas com a passagem, e um relógio acaba-as com a janela escondida', () => {
  assert.match(luasPc, /lista\.forEach\(\(x\) => x\.pause\(\)\);/);
  assert.match(luasPc, /relogio\.current = setTimeout\(acabarAPassagem, Math\.max\(0, ms\) \+ 100\);/);
});
caso('com menos movimento só cruzam', () => {
  assert.match(luasPc, /\? \[b\.animate\(\[\{ opacity: 0 \}, \{ opacity: 1 \}\], linear\)\]/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
