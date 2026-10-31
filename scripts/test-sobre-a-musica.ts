/**
 * A aba "About" do Now Playing e da barra da direita, o painel que não repete a fila com o
 * Now Playing aberto, e a letra grande (31/10, maquete `docs/now-playing-maquete.html`).
 * A conta é pura (`lib/sobreAMusica.ts`); a interface lê-se como TEXTO.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-sobre-a-musica.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chaveDeArtista } from '../src/lib/artistName.ts';
import {
  MAIS_OUVIDAS, haQuanto, numeroCurto, relogio, sobreAFaixa, sobreOArtista, textoDeVezes, type Contagem,
} from '../src/lib/sobreAMusica.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

const c = (id: string, title: string, artist: string, count: number, lastPlayed = 0): Contagem => ({
  source: 'youtube', sourceId: id, title, artist, artworkUrl: null, durationSeconds: 180, count, lastPlayed,
});
const CONTAGENS = [
  c('a', 'Just Wanna Rock', 'Lil Uzi Vert', 14, 1000),
  c('b', 'Prices', 'Lil Uzi Vert', 28),
  c('c', 'Sorry Not Sorry', 'LIL UZI VERT', 19),
  c('d', 'Money Longer', 'Lil Uzi Vert', 41),
  c('e', "God's Plan", 'Drake', 90),
  c('f', 'Nunca ouvida', 'Lil Uzi Vert', 0),
];
const UZI = chaveDeArtista('Lil Uzi Vert');

console.log('\no que ouviste do artista');
caso('o total e as mais ouvidas, pela chave canónica (JUICE e Juice são o mesmo)', () => {
  const r = sobreOArtista(CONTAGENS, UZI);
  assert.equal(r.jogadas, 14 + 28 + 19 + 41);
  assert.deepEqual(r.maisOuvidas.map((m) => m.faixa.sourceId), ['d', 'b', 'c']);
  assert.deepEqual(r.maisOuvidas.map((m) => m.vezes), [41, 28, 19]);
});
caso('a que toca agora conta no total mas fica fora das mais ouvidas (está à vista)', () => {
  const r = sobreOArtista(CONTAGENS, UZI, { source: 'youtube', sourceId: 'd' });
  assert.equal(r.jogadas, 14 + 28 + 19 + 41);
  assert.ok(!r.maisOuvidas.some((m) => m.faixa.sourceId === 'd'));
  assert.equal(r.maisOuvidas.length, MAIS_OUVIDAS);
});
caso('uma música sem escutas não entra, e sem artista não há nada', () => {
  assert.ok(!sobreOArtista(CONTAGENS, UZI).maisOuvidas.some((m) => m.faixa.sourceId === 'f'));
  assert.deepEqual(sobreOArtista(CONTAGENS, ''), { jogadas: 0, maisOuvidas: [] });
  assert.deepEqual(sobreOArtista([], UZI), { jogadas: 0, maisOuvidas: [] });
});

console.log('\no que ouviste desta música');
caso('quantas vezes e quando; sem registo, ainda não', () => {
  assert.deepEqual(sobreAFaixa(CONTAGENS, { source: 'youtube', sourceId: 'a' }), { vezes: 14, ultima: 1000 });
  assert.deepEqual(sobreAFaixa(CONTAGENS, { source: 'youtube', sourceId: 'zzz' }), { vezes: 0, ultima: null });
  assert.deepEqual(sobreAFaixa(CONTAGENS, { source: 'youtube', sourceId: 'f' }), { vezes: 0, ultima: null });
  assert.deepEqual(sobreAFaixa(CONTAGENS, null), { vezes: 0, ultima: null });
});
caso('as frases: "Not yet", "Once", "14 times"', () => {
  assert.equal(textoDeVezes(0), 'Not yet');
  assert.equal(textoDeVezes(1), 'Once');
  assert.equal(textoDeVezes(14), '14 times');
});
caso('há quanto tempo, em palavras', () => {
  const dia = 86_400_000, agora = 1_000 * dia;
  assert.equal(haQuanto(null, agora), '—');
  assert.equal(haQuanto(agora - 3600_000, agora), 'Today');
  assert.equal(haQuanto(agora - dia, agora), 'Yesterday');
  assert.equal(haQuanto(agora - 3 * dia, agora), '3 days ago');
  assert.equal(haQuanto(agora - 21 * dia, agora), '3 weeks ago');
  assert.equal(haQuanto(agora - 150 * dia, agora), '5 months ago');
  assert.equal(haQuanto(agora - 400 * dia, agora), 'Over a year ago');
});
caso('números curtos e o tempo do refrão', () => {
  assert.equal(numeroCurto(182), '182');
  assert.equal(numeroCurto(1234), '1.2K');
  assert.equal(numeroCurto(15000), '15K');
  assert.equal(numeroCurto(0), '0');
  assert.equal(relogio(48), '0:48');
  assert.equal(relogio(125), '2:05');
});

console.log('\na aba About');
const SOBRE = ler('src/desktop/SobreAMusica.web.tsx');
const HOOK = ler('src/hooks/useSobreAMusica.ts');
const NP = ler('src/desktop/paginas/NowPlayingPage.web.tsx');
const PAINEL = ler('src/desktop/PainelDoLeitor.web.tsx');
const FILA = ler('src/desktop/FilaDoLeitor.web.tsx');
const ESTADO = ler('src/desktop/estadoDoPainel.web.ts');
const NAVEGADOR = ler('src/navigation/RootNavigator.web.tsx');
const LETRAS = ler('src/components/LyricsView.tsx');
caso('só mostra o que se sabe: sem bio nem créditos inventados, e cada bloco some sem dados', () => {
  assert.ok(!/\bbio\b/i.test(SOBRE.replace(/\/\*[\s\S]*?\*\//g, '')), 'nenhuma das fontes tem bio');
  assert.match(SOBRE, /\{numeros\.length \? <View style=\{s\.numeros\}>/);
  assert.match(SOBRE, /\{d\.parecidos\.length \? <View style=\{s\.bloco\}>/);
  assert.match(SOBRE, /\{d\.lancamento \? <View style=\{s\.bloco\}>/);
  assert.match(SOBRE, /\{d\.maisOuvidas\.length \? <View style=\{s\.bloco\}>/);
  assert.match(SOBRE, /\{d\.refraoS != null \? <View style=\{s\.refrao\}>/);
});
caso('o artista abre pelo `useDestinos`, favorita-se pela mesma store dos Artists, e tocar passa pelo `tocarMusica`', () => {
  assert.match(SOBRE, /irPara\(\{ tipo: 'artista', nome: d\.nome \}\)/);
  assert.match(SOBRE, /useArtistasFavoritos\.getState\(\)\.alternar\(d\.chave\)/);
  assert.match(SOBRE, /usePlayer\.getState\(\)\.tocarMusica\(faixa, \[faixa\], false, undefined, null\)/);
});
caso('o botão direito de uma música do About abre o menu da app', () => {
  assert.match(SOBRE, /onContextMenu: \(e: any\) => \{ if \(!more\) return; e\.preventDefault\(\); more\(faixa\); \}/);
});
caso('nenhum pedido novo: contagens do aparelho, biblioteca em cache, só memória nas novidades, nada de fetch', () => {
  assert.match(HOOK, /contagensNoAparelho\(\)/);
  assert.match(HOOK, /lerFaixas\(getLibrary\)/);
  assert.match(HOOK, /lancamentoParaORadio\(chave\)/);
  assert.ok(!/fetch\(|supabase|setInterval|pesquisarMusica|lancamentosDoArtista|getTopArtists/.test(HOOK));
});
caso('nenhuma cor, tamanho ou raio fora da escala (os testes das escalas e da identidade correm sobre isto)', () => {
  assert.ok(!/fontSize: \d+\.5/.test(SOBRE));
  assert.ok(!/borderRadius: (5|6|7|9|10|11|17)\b/.test(SOBRE));
  assert.ok(!/className\s*[=:]/.test(SOBRE));
});

console.log('\no cartão do Now Playing e a barra da direita');
caso('o cartão tem a terceira aba, e a mostra com o artista e a música', () => {
  assert.match(NP, /<SobreAMusica track=\{track\} more=\{more\} notify=\{notify\} \/>/);
  assert.match(FILA, /export type AbaDoCartao = 'fila' \| 'letra' \| 'sobre';/);
});
caso('a barra da direita tem Queue, Lyrics e About, e a aba guardada aceita a nova', () => {
  assert.match(PAINEL, /const ABAS: readonly Aba\[\] = \['fila', 'letras', 'sobre'\];/);
  assert.match(PAINEL, /if \(aba === 'sobre'\) return <ScrollView/);
  assert.match(ESTADO, /export type AbaDoPainel = 'fila' \| 'letras' \| 'sobre';/);
  assert.match(ESTADO, /guardada\?\.aba === 'letras' \|\| guardada\?\.aba === 'sobre' \? guardada\.aba : 'fila'/);
});
caso('com o Now Playing aberto o painel recolhe-se (não se guarda) e a seta fica apagada, e volta ao fechar', () => {
  assert.match(NAVEGADOR, /useEffect\(\(\) => \{ usePainelDoLeitor\.setState\(\{ escondido: nowPlayingOpen \}\); \}, \[nowPlayingOpen\]\);/);
  assert.match(PAINEL, /const aberto = usePainelDoLeitor\(\(st\) => st\.aberto && !st\.escondido\);/);
  assert.match(PAINEL, /if \(aberto && !escondido\) return null;/);
  assert.match(PAINEL, /disabled=\{escondido\}/);
  assert.ok(!/escondido/.test(ESTADO.slice(ESTADO.indexOf('PREFERENCIA, JSON.stringify'), ESTADO.indexOf('PREFERENCIA, JSON.stringify') + 120)), 'o escondido não vai para o disco');
});

console.log('\na letra grande');
caso('"Expand" na aba da letra, a letra a toda a largura com a capa ao lado, e o Esc volta', () => {
  assert.match(NP, /\{abaDaFila === 'letra' \? <Pressable accessibilityRole="button" accessibilityLabel="Expand the lyrics" onPress=\{\(\) => setLetraGrande\(true\)\}/);
  assert.match(NP, /\{letraGrande \? \(/);
  assert.match(NP, /<LyricsView key=\{`grande:\$\{track\.source\}:\$\{track\.sourceId\}`\} track=\{track\} visible escala=\{1\.5\} \/>/);
  assert.match(NP, /e\.key === 'Escape' && !e\.defaultPrevented\) \{ e\.preventDefault\(\); setLetraGrande\(false\); \}/);
  assert.match(NP, /useEffect\(\(\) => \{ setLetraGrande\(false\); \}, \[current\?\.source, current\?\.sourceId\]\);/);
});
caso('a escala é opcional e de 1 por omissão: o iPhone e a letra do cartão ficam como estavam', () => {
  assert.match(LETRAS, /escala=1\}:\{track:Track;visible:boolean;/);
  assert.match(LETRAS, /if\(escala===1\)return t;/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
