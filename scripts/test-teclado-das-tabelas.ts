/**
 * Arrumar sem o dedo nem o rato (A5 da auditoria de elevação, 31/10).
 *
 * No PC, a `TrackTable` era o Tab linha a linha (mais o "…" de cada uma) e as
 * setas não faziam nada; a fila nem se alcançava com o teclado. Agora andam as
 * setas e o Enter toca; mudar uma música de sítio continua a ser a ARRASTAR (o
 * João, 31/10: "preferia que fosse dragable em vez de setas"). No iPhone, a
 * fila e a playlist em edição só se arrumavam com a pega, o toque longo e o
 * deslize, que o VoiceOver não alcança: passam a ter as ações no rotor. As
 * decisões são puras (`teclaNaLista`, `acoesDaLinha`); a ligação lê-se como
 * TEXTO.
 *
 * Correr: node --experimental-strip-types scripts/test-teclado-das-tabelas.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SALTO_DA_PAGINA, teclaNaLista } from '../src/lib/acessibilidadeDoPc.ts';
import { acoesDaLinha, fraseDoMover } from '../src/lib/menuDaFaixa.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

console.log('\nas teclas numa lista do PC');
caso('↑/↓ andam uma; nas pontas a tecla segue o seu caminho', () => {
  assert.deepEqual(teclaNaLista('ArrowDown', false, 3, 10), { tipo: 'foco', para: 4 });
  assert.deepEqual(teclaNaLista('ArrowUp', false, 3, 10), { tipo: 'foco', para: 2 });
  assert.equal(teclaNaLista('ArrowUp', false, 0, 10), null);
  assert.equal(teclaNaLista('ArrowDown', false, 9, 10), null);
});
caso(`Page Up/Down andam ${SALTO_DA_PAGINA}, presos às pontas; Home e End vão às pontas`, () => {
  assert.deepEqual(teclaNaLista('PageDown', false, 3, 50), { tipo: 'foco', para: 13 });
  assert.deepEqual(teclaNaLista('PageUp', false, 3, 50), { tipo: 'foco', para: 0 });
  assert.deepEqual(teclaNaLista('Home', false, 7, 50), { tipo: 'foco', para: 0 });
  assert.deepEqual(teclaNaLista('End', false, 7, 50), { tipo: 'foco', para: 49 });
  assert.equal(teclaNaLista('Home', false, 0, 50), null);
});
caso('com Alt nada: mudar uma música de sítio é a arrastar, não com setas (o João, 31/10)', () => {
  assert.equal(teclaNaLista('ArrowDown', true, 3, 10), null);
  assert.equal(teclaNaLista('ArrowUp', true, 3, 10), null);
  assert.equal(teclaNaLista('Enter', true, 3, 10), null);
});
caso('Enter toca; o Espaço é da janela (tocar/pausar), e uma lista vazia não responde', () => {
  assert.deepEqual(teclaNaLista('Enter', false, 2, 10), { tipo: 'tocar' });
  assert.equal(teclaNaLista(' ', false, 2, 10), null);
  assert.equal(teclaNaLista('ArrowDown', false, 0, 0), null);
  assert.equal(teclaNaLista('a', false, 2, 10), null);
});

console.log('\nas ações do VoiceOver numa linha do iPhone');
const nomes = (a: { name: string }[]) => a.map((x) => x.name);
caso('na fila: tocar, mover, tirar, guardar e o menu, com os nomes do menu', () => {
  const a = acoesDaLinha({ indice: 2, total: 5, tocar: true, podeMover: true, tirar: 'fila', guardada: false, menu: true });
  assert.deepEqual(nomes(a), ['activate', 'subir', 'descer', 'tirar', 'guardar', 'menu']);
  assert.deepEqual(a.map((x) => x.label), ['Play', 'Move up', 'Move down', 'Remove from queue', 'Add to Liked Songs', 'More options']);
  assert.equal(acoesDaLinha({ indice: 2, total: 5, tocar: true, podeMover: true, tirar: 'fila', guardada: true, menu: true })
    .find((x) => x.name === 'guardar')!.label, 'Remove from Liked Songs');
});
caso('a primeira não sobe e a última não desce', () => {
  assert.ok(!nomes(acoesDaLinha({ indice: 0, total: 3, tocar: true, podeMover: true, tirar: 'fila', guardada: null, menu: false })).includes('subir'));
  assert.ok(!nomes(acoesDaLinha({ indice: 2, total: 3, tocar: true, podeMover: true, tirar: 'fila', guardada: null, menu: false })).includes('descer'));
});
caso('numa Jam (ou a seguir um amigo) não se move nem se tira', () => {
  assert.deepEqual(nomes(acoesDaLinha({ indice: 1, total: 3, tocar: true, podeMover: false, tirar: 'fila', guardada: false, menu: true })), ['activate', 'guardar', 'menu']);
});
caso('na playlist em edição: só mover e tirar (a linha não toca nem guarda)', () => {
  const a = acoesDaLinha({ indice: 1, total: 3, tocar: false, podeMover: true, tirar: 'playlist', guardada: null, menu: false });
  assert.deepEqual(a, [{ name: 'subir', label: 'Move up' }, { name: 'descer', label: 'Move down' }, { name: 'tirar', label: 'Remove from this playlist' }]);
});
caso('os nomes de tirar e de guardar são os do menu de uma faixa', () => {
  const menu = ler('src/lib/menuDaFaixa.ts');
  for (const r of ['Remove from queue', 'Remove from this playlist', 'Add to Liked Songs', 'Remove from Liked Songs']) {
    assert.ok(menu.split(`'${r}'`).length >= 3, `"${r}" no menu e nas ações da linha`);
  }
});
caso('o anúncio depois de mover conta a partir de 1', () => {
  assert.equal(fraseDoMover('Night Engine', 3), 'Moved Night Engine to position 3');
});

console.log('\no PC');
const ui = ler('src/desktop/ui.web.tsx');
const tabela = ui.slice(ui.indexOf('export function TrackTable('), ui.indexOf('const ALTURA_DO_CABECALHO'));
caso('a tabela é UM ponto de Tab (índice itinerante) e as setas andam nela', () => {
  assert.match(tabela, /tabIndex=\{index === focoNaLista \? 0 : -1\} onFocus=\{\(\) => \{ if \(foco !== index\) setFoco\(index\); \}\}/);
  assert.match(tabela, /onKeyDown=\{\(e: any\) => aoTeclar\(e, index\)\}/);
  assert.match(tabela, /teclaNaLista\(e\.key, e\.altKey, index, tracks\.length\)/);
  assert.match(tabela, /<IconButton name="ellipsis-horizontal" label=\{`Actions for \$\{track\.title\}`\} foraDoTab /, 'o "…" sai do Tab');
  assert.match(ui, /tabIndex=\{foraDoTab \? -1 : undefined\}/);
});
caso('o estado do teclado vem antes do return da lista vazia (as regras dos hooks)', () => {
  assert.ok(tabela.indexOf('const [foco, setFoco] = useState(0);') < tabela.indexOf('if (!tracks.length) return'));
});
caso('o Enter é do Pressable (toca como o clique), e uma linha por montar monta-se antes do foco', () => {
  assert.match(tabela, /if \(!acao \|\| acao\.tipo === 'tocar'\) return;/);
  assert.match(tabela, /if \(acao\.para >= limite\) \{/);
  assert.match(tabela, /:scope > \[data-dt~="fila"\]/);
});
caso('o teclado não reordena (é a arrastar), e o arrastar da tabela ficou', () => {
  assert.ok(!/aoMover\(acao/.test(tabela), 'nenhuma tecla muda a ordem');
  assert.match(tabela, /onPointerDown=\{\(\(event: any\) => comecarArrasto\(event, track, \{ lista: listKey, indice: index \}\)\) as any\}/);
});
const fila = ler('src/desktop/FilaArrastavel.web.tsx');
caso('a fila do PC alcança-se com o teclado: um ponto de Tab, as setas andam, Enter toca', () => {
  assert.match(fila, /tabIndex=\{i === focoNaLista \? 0 : -1\}/);
  assert.match(fila, /onKeyDown=\{\(e: any\) => aoTeclar\(e, i, entrada\)\}/);
  assert.match(fila, /teclaNaLista\(e\.key, e\.altKey, i, entradas\.length\)/);
  assert.match(fila, /if \(acao\.tipo === 'tocar'\) \{ aoTocar\(entrada\.track\); return; \}/);
  assert.match(fila, /aria-label=\{`Options for \$\{tituloDaFaixa\(entrada\.track\)\}`\}\n\s+tabIndex=\{-1\}/);
  assert.ok(!/aoMover\(acao/.test(fila), 'mudar de sítio continua a ser a arrastar');
  assert.match(fila, /onPointerDown=\{\(e: any\) => \{\n\s+if \(!podeArrastar/);
});
caso('a linha da fila com o foco mostra a pega e o "…", como com o rato', () => {
  assert.match(ler('src/desktop/casca.web.tsx'), /\.np-fila-linha:focus-visible \.np-fila-pega, \.np-fila-linha:focus-visible \.np-fila-mais \{ opacity: 1; \}/);
});

console.log('\no iPhone');
caso('a linha que se arrasta passa a um elemento com as ações no rotor', () => {
  const linha = ler('src/components/LinhaArrastavel.tsx');
  assert.match(linha, /accessible=\{!!acessibilidade\}/);
  assert.match(linha, /accessibilityActions=\{acessibilidade \? \[\.\.\.acessibilidade\.acoes\] : undefined\}/);
  assert.match(linha, /onAccessibilityAction=\{acessibilidade \? \(e\) => acessibilidade\.aoAcao\(e\.nativeEvent\.actionName as NomeDaAcaoDaLinha\) : undefined\}/);
  assert.match(linha, /^import type \{ AcaoDaLinha, NomeDaAcaoDaLinha \} from '\.\.\/lib\/menuDaFaixa';$/m, 'só tipos: nada de novo nos duplos');
  assert.match(linha, /activateAfterLongPress=\{TOQUE_LONGO_PARA_ARRASTAR_MS\}/, 'segurar e arrastar ficou');
});
caso('a fila e a playlist em edição dão as ações, e o mover anuncia', () => {
  const q = ler('src/components/QueueSheet.tsx');
  assert.match(q, /acoes: acoesDaLinha\(\{\n\s+indice: index, total: upNext\.length, tocar: !foraDoTelemovel && !seguido, podeMover: canReorder,/);
  assert.match(q, /reordenarProximas\(index, para\);\n\s+AccessibilityInfo\.announceForAccessibility\(fraseDoMover\(/);
  assert.match(q, /if \(useOuvirJuntos\.getState\(\)\.sessao \|\| agora\.queueIndex === realIndex \|\| agora\.queue\[realIndex\] !== item\) return;\n\s+tirarComAviso\(realIndex, item\);/);
  const pl = ler('src/screens/PlaylistDetailScreen.tsx');
  assert.match(pl, /tirar: 'playlist', guardada: null, menu: false/);
  assert.match(pl, /setRascunho\(\(r\) => \(r \? moverNoRascunho\(r, index, para\) : r\)\);\n\s+AccessibilityInfo\.announceForAccessibility/);
});
caso('o leitor do iPhone não mudou (o Now Playing e o mini não usam estas linhas)', () => {
  assert.ok(!/acoesDaLinha|teclaNaLista/.test(ler('src/components/PlayerRoot.tsx')));
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
