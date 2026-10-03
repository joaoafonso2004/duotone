/**
 * A base de baixo numa peça só (src/lib/doca.ts) e as barrinhas da música que
 * toca (src/lib/barrasDaFaixa.ts), as duas de 3/10.
 *
 * Correr: node --experimental-strip-types scripts/test-base-e-barrinhas.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALTURA_DOS_SEPARADORES, ZONA_DA_MUSICA, comAlfa, medidaNova, modoDaDoca, posicoesDaDoca, rotasEmFoco,
} from '../src/lib/doca.ts';
import {
  ALTURA_MAXIMA, ALTURA_MINIMA, BARRAS, LARGURA, alturaNaFase, amostrasDaOnda, pecasDaCapsula,
} from '../src/lib/barrasDaFaixa.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8');
const MINI = 64;

console.log('\nonde aparece a base');
caso('nas secções: música e separadores', () => {
  assert.equal(modoDaDoca(['Tabs', 'Search']), 'separadores');
  assert.equal(modoDaDoca(['Tabs', 'Artists', 'LibraryGroup']), 'separadores');
  assert.equal(modoDaDoca([]), 'separadores');
});
caso('num ecrã aberto por cima das secções, sem separadores', () => {
  assert.equal(modoDaDoca(['PlaylistDetail']), 'semSeparadores');
  assert.equal(modoDaDoca(['Downloads']), 'semSeparadores');
});
caso('nas Definições, no Library check e no Importar, sai toda (João, 3/10)', () => {
  assert.equal(modoDaDoca(['Settings']), 'escondida');
  assert.equal(modoDaDoca(['LibraryCheck']), 'escondida');
  assert.equal(modoDaDoca(['Tabs', 'Playlists', 'ImportYouTube']), 'escondida');
});
caso('as rotas em foco seguem os navegadores por dentro', () => {
  const estado = { index: 0, routes: [{ name: 'Tabs', state: { index: 3, routes: [
    { name: 'Search' }, { name: 'Songs' }, { name: 'Artists' },
    { name: 'Playlists', state: { index: 1, routes: [{ name: 'Playlists' }, { name: 'ImportYouTube' }] } },
  ] } }, { name: 'Settings' }] };
  assert.deepEqual(rotasEmFoco(estado), ['Tabs', 'Playlists', 'ImportYouTube']);
  assert.deepEqual(rotasEmFoco({ ...estado, index: 1 }), ['Settings']);
  assert.deepEqual(rotasEmFoco(undefined), []);
});
caso('uma folha nativa (a fila) conta o ecrã de trás', () => {
  const sobreAsSeccoes = { index: 1, routes: [{ name: 'Tabs', state: { index: 0, routes: [{ name: 'Search' }] } }, { name: 'Fila' }] };
  assert.deepEqual(rotasEmFoco(sobreAsSeccoes), ['Tabs', 'Search']);
  assert.equal(modoDaDoca(rotasEmFoco(sobreAsSeccoes)), 'separadores');
});

console.log('\npara onde vai cada parte');
const FUNDO = 34;
const ALTURA = ZONA_DA_MUSICA + ALTURA_DOS_SEPARADORES + FUNDO;
caso('nas secções com música, tudo no sítio', () => {
  assert.deepEqual(posicoesDaDoca('separadores', true, FUNDO), { vidro: 0, musica: 0, icones: 0 });
});
caso('fechar a música baixa o vidro até ficar só a altura dos separadores', () => {
  const p = posicoesDaDoca('separadores', false, FUNDO);
  assert.equal(ALTURA - p.vidro, ALTURA_DOS_SEPARADORES + FUNDO);
  assert.equal(p.icones, 0);
});
caso('sem separadores, a música desce para o fundo e fica dentro do vidro', () => {
  const p = posicoesDaDoca('semSeparadores', true, FUNDO);
  // A linha da música (64 pt) fica 4 pt acima dos separadores nas secções.
  const baseDaLinha = ALTURA_DOS_SEPARADORES + FUNDO + 4 - p.musica;
  const topoDoVidro = ALTURA - p.vidro;
  assert.ok(baseDaLinha >= FUNDO, 'por cima do indicador de casa');
  assert.ok(baseDaLinha + MINI <= topoDoVidro, `a linha (${baseDaLinha + MINI}) cabe no vidro (${topoDoVidro})`);
  assert.ok(p.icones >= ALTURA_DOS_SEPARADORES + FUNDO, 'os separadores saem do ecrã');
});
caso('escondida, nada fica no ecrã', () => {
  for (const temMusica of [true, false]) {
    const p = posicoesDaDoca('escondida', temMusica, FUNDO);
    assert.ok(p.vidro >= ALTURA && p.icones >= ALTURA_DOS_SEPARADORES + FUNDO);
    assert.ok(p.musica >= ALTURA, 'a música também sai');
  }
  const semNada = posicoesDaDoca('semSeparadores', false, FUNDO);
  assert.ok(semNada.vidro >= ALTURA, 'sem música e sem separadores não sobra vidro');
});
caso('com o texto grande (separadores mais altos), a música continua dentro do vidro', () => {
  for (const sep of [54, 58, 62]) {
    const altura = ZONA_DA_MUSICA + sep + FUNDO;
    const p = posicoesDaDoca('semSeparadores', true, FUNDO, sep);
    const baseDaLinha = sep + FUNDO + 4 - p.musica;
    assert.ok(baseDaLinha >= FUNDO && baseDaLinha + MINI <= altura - p.vidro, `com ${sep} pt`);
    assert.ok(posicoesDaDoca('escondida', true, FUNDO, sep).vidro >= altura);
  }
});
caso('a medida dos separadores só muda com meio ponto ou mais', () => {
  assert.equal(medidaNova(54, 54.2), null);
  assert.equal(medidaNova(54, 61.3), 61.5);
  assert.equal(medidaNova(54, 0), null);
});
caso('a cor da capa com transparência', () => {
  assert.equal(comAlfa('#C9A86A', 0.26), 'rgba(201,168,106,0.26)');
  assert.equal(comAlfa('#fff', 0), 'rgba(255,255,255,0)');
  assert.equal(comAlfa('rgb(1,2,3)', 0.5), 'rgb(1,2,3)');
});

console.log('\nas barrinhas');
caso('a onda fecha a volta sem salto (o Animated.loop recomeça no 0)', () => {
  BARRAS.forEach((_, i) => {
    assert.ok(Math.abs(alturaNaFase(i, 0) - alturaNaFase(i, 1)) < 1e-9);
    const a = amostrasDaOnda(i);
    assert.ok(Math.abs(a.outputRange[0] - a.outputRange[a.outputRange.length - 1]) < 1e-9);
  });
});
caso('a tocar, nunca são pontos nem passam da altura máxima', () => {
  BARRAS.forEach((_, i) => {
    for (let t = 0; t <= 1; t += 0.01) {
      const h = alturaNaFase(i, t);
      assert.ok(h >= ALTURA_MINIMA - 1e-9 && h <= ALTURA_MAXIMA + 1e-9, `${h}`);
      assert.ok(h > LARGURA, 'uma barra a tocar é mais alta do que um ponto');
    }
  });
});
caso('as três não andam juntas', () => {
  const t = 0.1;
  const alturas = BARRAS.map((_, i) => alturaNaFase(i, t).toFixed(2));
  assert.equal(new Set(alturas).size, 3);
});
caso('em pausa, cada barra é um ponto redondo', () => {
  const p = pecasDaCapsula(0);
  assert.equal(p.afastamento, 0);
  assert.equal(p.escalaDoMeio, 0);
});
caso('na altura máxima, os pontos tocam as pontas e o meio enche', () => {
  const p = pecasDaCapsula(ALTURA_MAXIMA - LARGURA);
  const centro = ALTURA_MAXIMA / 2;
  assert.equal(centro - p.afastamento - LARGURA / 2, 0);
  assert.equal(centro + p.afastamento + LARGURA / 2, ALTURA_MAXIMA);
  assert.equal(p.escalaDoMeio, 1);
});

console.log('\nligado');
caso('a linha que toca leva as barrinhas e perdeu o fundo tingido', () => {
  const linha = ler('src/components/TrackRow.tsx');
  assert.match(linha, /\{ativo \? <BarrasDaFaixa \/> : null\}/);
  assert.doesNotMatch(linha, /backgroundColor: theme\.soft/);
});
caso('as barrinhas passam a reticências suaves e só andam à vista', () => {
  const b = ler('src/components/BarrasDaFaixa.tsx');
  assert.match(b, /Animated\.timing\(tocando/);
  assert.match(b, /useAVista/);
  assert.match(b, /useNativeDriver: true/);
  assert.doesNotMatch(b, /useNativeDriver: false/);
});
caso('a base é uma peça: vidro e separadores na Doca, a linha transparente no leitor', () => {
  const doca = ler('src/components/Doca.tsx');
  const barra = ler('src/navigation/BarraDeSeparadores.tsx');
  const leitor = ler('src/components/PlayerRoot.tsx');
  assert.match(ler('src/navigation/RootNavigator.tsx'), /<Doca \/>/);
  assert.match(doca, /IconesDosSeparadores/);
  assert.doesNotMatch(barra, /BlurView/, 'o vidro saiu da barra');
  assert.match(barra, /publicarSeparadores/);
  assert.match(leitor, /desvioDaMusica/);
  assert.doesNotMatch(leitor, /currentRoute === 'Settings'/);
  const mini = /\n  mini: \{([^}]*)\}/.exec(leitor)?.[1] ?? '';
  assert.doesNotMatch(mini, /backgroundColor|shadow|borderWidth/, 'a linha da música não tem cartão');
});
caso('a cor da capa só com "seguir a cor da capa" ligado (João, 3/10)', () => {
  assert.match(ler('src/components/Doca.tsx'), /s\.mode === 'cover'/);
});
caso('a altura dos separadores é medida na base, e o 49 à mão não volta (auditoria 1.3)', () => {
  assert.match(ler('src/components/Doca.tsx'), /onLayout=\{\(e\) => definirAlturaDosSeparadores\(/);
  for (const f of ['src/components/PlayerRoot.tsx', 'src/components/HandoffBanner.tsx', 'src/components/AvisoDeRemocao.tsx',
    'src/components/useSocialBottomPadding.ts', 'src/screens/ArtistsScreen.tsx', 'src/screens/ImportYouTubeScreen.tsx',
    'src/screens/LibraryGroupScreen.tsx', 'src/screens/PlaylistDetailScreen.tsx', 'src/screens/PlaylistsScreen.tsx',
    'src/screens/SearchScreen.tsx', 'src/screens/SongsScreen.tsx', 'src/screens/VocesOsDoisScreen.tsx']) {
    const codigo = ler(f).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(codigo, /\b49\s*\+|\?\s*49\s*:|TAB_BAR_BASE\s*=\s*49/, `${f} voltou a ter o 49`);
    assert.match(codigo, /useAlturaDosSeparadores\(\)/, `${f} não lê a medida`);
  }
});
caso('as molas da base não andam num Animated.parallel', () => {
  assert.doesNotMatch(ler('src/components/Doca.tsx'), /Animated\.parallel\(/);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');
