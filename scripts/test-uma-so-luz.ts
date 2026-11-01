/**
 * Uma só luz (C10, 1/11): os carregamentos com as formas do que vem e um só
 * reflexo, nas duas plataformas, e os vazios com os discos numa pose.
 *
 * Correr: node --experimental-strip-types scripts/test-uma-so-luz.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CICLO_MAXIMO_MS, faseDoCarregamento, FRASES_DO_CARREGAMENTO, LUZ_DO_CARREGAMENTO_MS, poseDoVazio,
} from '../src/lib/luz.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
function todos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((n) => {
    const f = join(pasta, n);
    return statSync(f).isDirectory() ? todos(f) : /\.tsx?$/.test(n) ? [f.replace(/\\/g, '/')] : [];
  });
}

console.log('\nas regras');
caso('a luz anda até aos 4 s; depois pára e diz-se "Still loading…"', () => {
  assert.equal(CICLO_MAXIMO_MS, 4000);
  assert.equal(faseDoCarregamento(0), 'luz');
  assert.equal(faseDoCarregamento(3999), 'luz');
  assert.equal(faseDoCarregamento(4000), 'ainda');
  assert.equal(FRASES_DO_CARREGAMENTO.ainda, 'Still loading…');
  assert.equal(LUZ_DO_CARREGAMENTO_MS, 1600);
});
caso('a pose dos discos sai do ícone do vazio', () => {
  assert.equal(poseDoVazio('heart-outline'), 'par');
  assert.equal(poseDoVazio('musical-notes-outline'), 'par');
  assert.equal(poseDoVazio('search-outline'), 'procura');
  assert.equal(poseDoVazio('cloud-offline-outline'), 'eclipse');
  assert.equal(poseDoVazio('alert-circle-outline'), 'eclipse');
  assert.equal(poseDoVazio('add-circle-outline'), 'espaco');
  assert.equal(poseDoVazio('list-outline'), 'espaco');
});

console.log('\nno PC: as formas e uma luz só, presa à janela');
caso('nenhuma página carrega com a roda: o Loading só fica no arranque da app', () => {
  const comRoda = todos('src/desktop').concat(todos('src/navigation'))
    .filter((f) => /<Loading\b/.test(ler(f)))
    .filter((f) => f !== 'src/navigation/RootNavigator.web.tsx');
  assert.deepEqual(comRoda, []);
  assert.ok(!/height: \d+ \}\}><Loading/.test(todos('src/desktop').map(ler).join('\n')), 'nada de caixas de altura fixa');
});
caso('as páginas usam as formas do que vem (a do artista já não tem três rodas)', () => {
  const biblioteca = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
  assert.ok((biblioteca.match(/<Carregando forma=/g) ?? []).length >= 11, 'as onze da biblioteca, da pesquisa e do artista');
  assert.match(biblioteca, /\{aProcurarAlbuns \? <Carregando forma="capas" \/>/);
  assert.match(biblioteca, /aoTentar=\{pesquisarAgora\}/, 'a pesquisa sabe tentar outra vez');
  for (const f of ['PlaylistPages', 'ProfilePage', 'RetrospetivaPage', 'VocesOsDoisPage']) {
    assert.match(ler(`src/desktop/paginas/${f}.web.tsx`), /<Carregando forma="/, f);
  }
});
caso('o Carregando: aos 4 s tira o "carregando" (a luz pára) e diz "Still loading…" por cima', () => {
  const c = ler('src/desktop/Carregando.web.tsx');
  assert.match(c, /setTimeout\(\(\) => setAinda\(true\), CICLO_MAXIMO_MS\)/);
  assert.match(c, /marcar\('formas', \.\.\.\(ainda \? \[\] : \['carregando'\]\)\)/);
  assert.match(c, /position: 'absolute', top: 0, left: 0, zIndex: 2/, 'por cima das formas: nada salta');
});
caso('a casca: um só gradiente preso à janela, e com menos movimento as formas sem luz', () => {
  const casca = ler('src/desktop/casca.web.tsx');
  assert.match(casca, /\[data-dt~="carregando"\] \[data-dt~="forma"\]\{\n\s*background-image: linear-gradient\(\$\{INCLINACAO_DO_CARREGAMENTO\}deg/);
  assert.match(casca, /background-size: 220vw 100%; background-attachment: fixed;/);
  assert.match(casca, /animation: dt-luz-unica \$\{LUZ_DO_CARREGAMENTO_MS\}ms ease-in-out infinite;/);
  assert.match(casca, /\[data-dt~="carregando"\] \[data-dt~="forma"\]\{ background-image: none !important; \}/);
});

console.log('\nno iPhone: as barras paradas e uma luz por baixo de uma máscara');
caso('o Skeleton: nada pisca por barra; o MaskedView, a banda no driver nativo e o fim aos 4 s', () => {
  const s = ler('src/components/Skeleton.tsx');
  assert.match(s, /function Barra\(\{ style \}: \{ style\?: ViewStyle \}\) \{\n\s*return <View \{\.\.\.marcaDoPc\('forma'\)\} style=\{\[styles\.barra, style\]\} \/>;/);
  assert.match(s, /<MaskedView maskElement=\{<View>\{children\}<\/View>\}>/);
  assert.match(s, /duration: LUZ_DO_CARREGAMENTO_MS, easing: Easing\.inOut\(Easing\.quad\), useNativeDriver: true/);
  assert.match(s, /pedirFluidez\(CICLO_MAXIMO_MS\)/);
  assert.match(s, /setTimeout\(\(\) => setAinda\(true\), CICLO_MAXIMO_MS\)/);
  const abre = (s.match(/<LuzDoCarregamento>/g) ?? []).length;
  assert.equal(abre, (s.match(/<\/LuzDoCarregamento>/g) ?? []).length);
  assert.ok(abre >= 7, `os esqueletos todos com a luz (${abre})`);
});
caso('as páginas que eram uma roda: a playlist, as estatísticas, a retrospetiva, o You two e a importação', () => {
  assert.match(ler('src/screens/PlaylistDetailScreen.tsx'), /loading \? \(\n\s*<View style=\{\{ marginTop: cab\.espaco \+ 8 \}\}><SkeletonDeFaixas \/><\/View>/);
  for (const f of ['ListeningStatsScreen', 'RetrospetivaScreen', 'VocesOsDoisScreen', 'ImportYouTubeScreen']) {
    const s = ler(`src/screens/${f}.tsx`);
    assert.ok(!/<ActivityIndicator\b/.test(s), `${f}: sem roda`);
    assert.match(s, /<Skeleton(DeEstatisticas|DeFaixas)\b/, f);
  }
});

console.log('\nos vazios: os discos numa pose, nas duas');
caso('o Empty do PC e o EmptyState do iPhone desenham os discos', () => {
  assert.match(ler('src/desktop/ui.web.tsx'), /<DiscosDoVazio pose=\{poseDoVazio\(icon\)\} \/>/);
  assert.match(ler('src/components/EmptyState.tsx'), /<DiscosDoVazio pose=\{poseDoVazio\(icon\)\} \/>/);
  assert.match(ler('src/components/DiscosDoVazio.tsx'), /importantForAccessibility="no-hide-descendants"/, 'é decoração: não chega ao VoiceOver');
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
