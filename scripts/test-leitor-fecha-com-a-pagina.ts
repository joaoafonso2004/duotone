// O Now Playing do PC fecha no MESMO fotograma em que a página nova entra
// (30/9). A página muda numa transição do React (`mudarRota`, 27/9); fechar o
// leitor fora dela fechava-o logo, e durante um ou dois fotogramas via-se a
// página de ANTES por baixo (Artists -> Now Playing -> Liked Songs mostrava os
// Artists antes das Liked Songs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const nav = readFileSync(new URL('../src/navigation/RootNavigator.web.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// A transição leva as duas mudanças juntas (o `startTransition` do
// `useTransition`, que também dá o "pendente" para a página de agora se esbater).
assert.match(nav, /const \[aMudarDePagina, startTransition\] = useTransition\(\);/);
assert.match(nav, /<TransicaoDePagina chave=\{JSON\.stringify\(route\)\} aSair=\{aMudarDePagina\}>/);
assert.match(nav, /startTransition\(\(\) => \{\n\s+setRoute\(next\);\n\s+if \(fecharLeitor\) setNowPlayingOpen\(false\);\n\s+\}\);/,
  'o leitor fecha dentro da transição da página');

const corpo = (nome: string) => {
  const i = nav.indexOf(`const ${nome} = useCallback(`);
  assert.ok(i >= 0, nome);
  return nav.slice(i, nav.indexOf('\n  }, [', i));
};
// Quem muda de página com o leitor aberto passa-lhe o fecho.
assert.match(corpo('navigate'), /mudarRota\(next, \{ fecharLeitor: true \}\)/);
assert.match(corpo('avancar'), /mudarRota\(seguinte, \{ fecharLeitor: true \}\)/);
assert.match(corpo('abrirSocial'), /mudarRota\(next, \{ fecharLeitor: true \}\)/);
// E nenhum deles o fecha à parte antes de mudar de página.
for (const nome of ['navigate', 'avancar', 'abrirSocial']) {
  assert.ok(!/setNowPlayingOpen\(false\);\s*(history\.current\.push\([^)]*\);\s*)?mudarRota\(/.test(corpo(nome)),
    `${nome}: fecha o leitor fora da transição`);
}

console.log('O leitor fecha com a página: passou.');
