/**
 * As Liked Songs do PC (30/10, passo 3 de `docs/PLANO-ELEVAR-PC.md`): o resumo
 * "73 songs · 4 h 12 min" por baixo do título, a ordem à vista, o cabeçalho da
 * tabela preso ao rolar, o atalho para a faixa que toca, o ícone da fila na
 * barra de título e o @ da conta em vez do email. A conta é pura
 * (`lib/duracaoTotal.ts`); o resto lê o código como TEXTO, como os outros
 * testes do PC.
 *
 * Correr: node --experimental-strip-types scripts/test-liked-songs-pc.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { duracaoTotal, resumoDaLista } from '../src/lib/duracaoTotal.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const UI = ler('src/desktop/ui.web.tsx');
const PAGINA = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
const CASCA = ler('src/desktop/casca.web.tsx');
const PAINEL = ler('src/desktop/PainelDoLeitor.web.tsx');

console.log('\no resumo por baixo do título');
caso('horas e minutos, só minutos, ou só horas', () => {
  assert.equal(duracaoTotal(4 * 3600 + 12 * 60), '4 h 12 min');
  assert.equal(duracaoTotal(38 * 60), '38 min');
  assert.equal(duracaoTotal(2 * 3600), '2 h');
  assert.equal(duracaoTotal(59 * 60 + 40), '1 h', 'arredonda ao minuto: 59 min 40 s são 60');
});
caso('menos de um minuto sobe a um, e sem tempo nenhum não há texto', () => {
  assert.equal(duracaoTotal(20), '1 min');
  assert.equal(duracaoTotal(0), '');
  assert.equal(duracaoTotal(NaN), '');
  assert.equal(duracaoTotal(-5), '');
});
caso('o resumo conta as músicas e soma só as que têm duração', () => {
  assert.equal(resumoDaLista([{ durationSeconds: 3600 }, { durationSeconds: 1800 }, { durationSeconds: null }]), '3 songs · 1 h 30 min');
  assert.equal(resumoDaLista([{ durationSeconds: 200 }]), '1 song · 3 min');
  assert.equal(resumoDaLista([{ durationSeconds: null }, {}]), '2 songs', 'sem nenhuma duração fica só o número');
  assert.equal(resumoDaLista([]), '0 songs');
});
caso('o título leva "Playlist" por cima e o resumo da lista TODA por baixo', () => {
  assert.match(PAGINA, /<Page title="Liked Songs" eyebrow="Playlist" lavagem="rgba\(108,92,255,\.34\)" subtitle=\{resumo\}/);
  assert.match(PAGINA, /const resumo = data\.loading \|\| data\.semLista \? undefined : resumoDaLista\(data\.tracks\);/);
});
caso('a barra só conta enquanto se pesquisa ("12 of 73 songs")', () => {
  assert.match(PAGINA, /data\.semLista \|\| !query \? null : <Text style=\{styles\.songsResultCount\}>\{filteredTracks\.length\} of \{data\.tracks\.length\}/);
});

console.log('\na ordem à vista');
caso('Recent / Title / Artist, no mesmo estado do cabeçalho da tabela', () => {
  assert.match(PAGINA, /\{ id: 'recent', rotulo: 'Recent' \}, \{ id: 'title', rotulo: 'Title' \}, \{ id: 'artist', rotulo: 'Artist' \}/);
  assert.match(PAGINA, /valor=\{ordem \?\? 'recent'\}/);
  assert.match(PAGINA, /aoMudar=\{\(id\) => setOrdem\(id === 'recent' \? null : \(id as ColunaOrdenavel\)\)\}/);
});
caso('os chips são um grupo de opções, com o estado de escolhido da app', () => {
  assert.match(UI, /accessibilityRole=\{'radiogroup' as any\} accessibilityLabel=\{rotulo\}/);
  assert.match(UI, /accessibilityRole=\{'radio' as any\} accessibilityState=\{\{ checked: aceso \}\}/);
  assert.match(UI, /aceso \? ESTADO\.escolhido : hovered && \{ backgroundColor: ESTADO\.hover \}/);
});

console.log('\no cabeçalho da tabela (sem faixa escura, 30/10)');
caso('sem fundo escuro e sem ficar preso: só as letras e um fio, e rola com a lista (o João: a faixa "não pertence")', () => {
  assert.match(UI, /tableHeaderPlain: \{ paddingHorizontal: ESP\.sm, borderTopWidth: 1, borderTopColor: COR\.linhaSuave, backgroundColor: 'transparent' \}/);
  assert.ok(!/tableHeaderPlain: \{[^}]*sticky/.test(UI));
  assert.match(UI, /tablePlain: \{ borderWidth: 0, borderRadius: 0, backgroundColor: 'transparent', overflow: 'visible' \}/);
});

console.log('\no atalho para a que toca');
caso('só com o `saltoParaAtual`, e só as Liked Songs o ligam por agora', () => {
  assert.match(UI, /saltoParaAtual = false \}: \{/);
  assert.match(PAGINA, /<TrackTable plain saltoParaAtual listKey=/);
  assert.equal((PAGINA.match(/saltoParaAtual/g) ?? []).length, 1);
});
caso('mede-se a linha da que toca ao rolar (não com um IntersectionObserver, que não vê quem passa de baixo a cima)', () => {
  assert.match(UI, /ref=\{aTocar && saltoParaAtual \? setNoDaAtual : undefined\}/);
  assert.ok(!/new IntersectionObserver\(/.test(UI.slice(UI.indexOf('function SaltoParaAAtual'))), 'o observador só avisa de quem entra ou sai');
  assert.match(UI, /alvo\.addEventListener\('scroll', agendar, \{ passive: true \}\)/);
  assert.match(UI, /if \(!quadro\) quadro = requestAnimationFrame\(medir\)/);
  assert.match(UI, /r\.bottom <= j\.top \+ ALTURA_DO_CABECALHO \? 'cima' : r\.top >= j\.bottom \? 'baixo' : null/);
  assert.match(UI, /<Ionicons name=\{onde === 'cima' \? 'arrow-up' : 'arrow-down'\}/);
});
caso('limpa o ouvinte e o fotograma pedido ao sair', () => {
  assert.match(UI, /cancelAnimationFrame\(quadro\);\n\s+alvo\.removeEventListener\('scroll', agendar\);/);
});
caso('uma linha ainda por montar monta-se até lá e depois rola', () => {
  assert.match(UI, /const onde = indice >= carregadas \? 'baixo' : lado;/);
  assert.match(UI, /if \(indice >= carregadas\) \{ aoCarregar\(indice\); setAIr\(true\); \}/);
  assert.match(UI, /useEffect\(\(\) => \{ if \(aIr && no\) \{ setAIr\(false\); rolar\(no\); \} \}, \[aIr, no\]\);/);
});
caso('fica preso com altura zero (não mexe no tamanho da lista) e rola sem animar com "menos movimento"', () => {
  assert.match(UI, /preso: \{ height: 0, alignItems: 'center', position: 'sticky', bottom: 56, zIndex: 5 \}/);
  assert.match(UI, /prefers-reduced-motion: reduce\)'\)\.matches \? 'auto' : 'smooth'/);
});
caso('entra de leve, e quem pediu menos movimento fica sem a animação', () => {
  assert.match(CASCA, /\[data-dt~="salto-atual"\]\{ animation: dt-linha 220ms var\(--dt-curva\) backwards; \}/);
  const bloco = CASCA.slice(CASCA.lastIndexOf('prefers-reduced-motion'));
  // A regra cresceu com os ícones de estado (30/10): o atalho continua na lista das animações desligadas.
  assert.match(bloco, /\[data-dt~="salto-atual"\],[^{]*\{ animation: none !important; \}/);
});

console.log('\na barra de título e a lateral');
caso('o ícone do painel é a fila, e já não uma seta', () => {
  assert.match(PAINEL, /<Ionicons name="list" size=\{18\} color=\{COR\.textoMedio\} \/>/);
  assert.ok(!PAINEL.includes('chevron-back'));
  assert.match(PAINEL, /accessibilityLabel="Open queue and lyrics panel"/);
});
caso('a lateral diz o @ da conta, e só sem ele volta ao email (do mesmo perfil que já se lê)', () => {
  assert.match(CASCA, /setUsername\(p\.username\|\|null\)/);
  assert.match(CASCA, /\{username\?`@\$\{username\}`:session\?\.user\.email\}/);
});
caso('nada de backdrop-filter', () => {
  assert.ok(!/backdrop-filter\s*:/.test(UI + PAGINA));
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
