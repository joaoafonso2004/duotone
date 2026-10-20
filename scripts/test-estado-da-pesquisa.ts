/**
 * O que a pesquisa mostra (src/lib/estadoDaPesquisa.ts, 20/10, revisão de
 * qualidade Q1 e Q2): o que é teu nunca espera pela rede nem desaparece com uma
 * falha dela, e uma falha tem "Try again" -- nas duas plataformas.
 *
 * Correr: node --experimental-strip-types scripts/test-estado-da-pesquisa.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estadoDaPesquisa, FRASES_DA_PESQUISA } from '../src/lib/estadoDaPesquisa.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const base = { pergunta: 'magnolia', aCarregar: false, erro: null, online: 0, naBiblioteca: 0 };

console.log('\nas regras');
caso('menos de duas letras é a Home, seja qual for o resto', () => {
  assert.deepEqual(estadoDaPesquisa({ ...base, pergunta: ' m ', naBiblioteca: 3, erro: 'x' }), { tipo: 'curta' });
});
caso('o que é teu aparece enquanto a parte online carrega', () => {
  assert.deepEqual(estadoDaPesquisa({ ...base, aCarregar: true, naBiblioteca: 2 }), { tipo: 'resultados', rodape: 'a-carregar' });
});
caso('e continua lá quando a parte online falha, com a falha por baixo', () => {
  assert.deepEqual(estadoDaPesquisa({ ...base, erro: "No connection. Try again when you're online.", naBiblioteca: 2 }),
    { tipo: 'resultados', rodape: 'falhou' });
});
caso('sem nada da biblioteca, carregar e falhar ocupam o lugar', () => {
  assert.deepEqual(estadoDaPesquisa({ ...base, aCarregar: true }), { tipo: 'a-carregar' });
  assert.deepEqual(estadoDaPesquisa({ ...base, erro: true }), { tipo: 'falhou' });
});
caso('resultados online não levam rodapé', () => {
  assert.deepEqual(estadoDaPesquisa({ ...base, online: 20 }), { tipo: 'resultados', rodape: null });
  assert.deepEqual(estadoDaPesquisa({ ...base, online: 20, naBiblioteca: 1 }), { tipo: 'resultados', rodape: null });
});
caso('nada em lado nenhum, sem falha, é "No results"', () => {
  assert.deepEqual(estadoDaPesquisa(base), { tipo: 'sem-resultados' });
  assert.deepEqual(estadoDaPesquisa({ ...base, naBiblioteca: 1 }), { tipo: 'resultados', rodape: null });
});

console.log('\nligado nas duas plataformas');
const hook = ler('src/hooks/useMusicSearch.ts');
const porTipo = ler('src/hooks/usePesquisaPorTipo.ts');
const iphone = ler('src/screens/SearchScreen.tsx');
const pc = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
caso('o erro é uma frase para pessoas, não o texto do pedido', () => {
  assert.match(hook, /setErrorMsg\(mensagemDeErro\(e, FRASES_DA_PESQUISA\.semMotivo\)\)/);
  assert.doesNotMatch(hook, /setErrorMsg\(e\?\.message/);
});
caso('a pesquisa por tipo deixa repetir a mesma pergunta', () => {
  assert.match(porTipo, /return \{ \.\.\.resultado, loading, falhou, repetir \}/);
  assert.match(porTipo, /\[query, separador, tentativa\]/);
});
caso('os dois ecrãs decidem pelo mesmo estado e dizem as mesmas frases', () => {
  for (const [nome, s] of [['iPhone', iphone], ['PC', pc]] as const) {
    assert.match(s, /estadoDaPesquisa\(\{/, `${nome}: decide pelo lib`);
    assert.match(s, /rodape === 'falhou'/, `${nome}: a falha por baixo do que é teu`);
    assert.match(s, /rodape === 'a-carregar'/, `${nome}: a parte online a chegar`);
    assert.match(s, /FRASES_DA_PESQUISA\.tentarDeNovo/, `${nome}: "Try again"`);
    assert.doesNotMatch(s, /title="Search failed"|'Search failed'|Something went wrong/, `${nome}: frase escrita à mão`);
  }
});
caso('"Try again" repete a pergunta (o pesquisarAgora e o repetir)', () => {
  assert.equal((iphone.match(/onPress=\{pesquisarAgora\}/g) ?? []).length, 2, 'iPhone: a falha e o rodapé');
  assert.match(iphone, /onPress=\{porTipo\.repetir\}/);
  assert.match(pc, /onPress=\{pesquisarAgora\}>\{FRASES_DA_PESQUISA\.tentarDeNovo\}/);
  assert.match(pc, /aoTentar=\{pesquisarAgora\}/);
  assert.equal((pc.match(/aoTentar=\{porTipo\.repetir\}/g) ?? []).length, 2, 'PC: artistas e capas');
});
caso('no iPhone o esqueleto e a falha já não vêm antes das tuas músicas', () => {
  assert.doesNotMatch(iphone, /\) : loading \? \(\n\s*<View style=\{\{ paddingTop: cab\.espaco \}\}><SkeletonDeFaixas \/>/);
  assert.doesNotMatch(iphone, /\) : errorMsg \? \(/);
});
caso('as frases cabem nas regras da interface', () => {
  for (const f of Object.values(FRASES_DA_PESQUISA)) assert.doesNotMatch(f, /YouTube/i, f);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');
