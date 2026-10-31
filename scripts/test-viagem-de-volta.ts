/**
 * A viagem de volta (30/10, a continuação dos passos 2 e 4 de
 * `docs/PLANO-ELEVAR-PC.md`): do cabeçalho de uma playlist ou de um artista de
 * volta ao cartão dele na grelha. A conta das chaves é pura
 * (`lib/retratosQueViajam.ts`); a ponte (`desktop/viagem.web.ts`) e a casca
 * lêem-se como TEXTO.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-viagem-de-volta.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RETRATO, retratosDaVolta } from '../src/lib/retratosQueViajam.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const VIAGEM = ler('src/desktop/viagem.web.ts');
const NAVEGADOR = ler('src/navigation/RootNavigator.web.tsx');
const PLAYLISTS = ler('src/desktop/paginas/PlaylistPages.web.tsx');
const BIBLIOTECA = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
const voltar = VIAGEM.slice(VIAGEM.indexOf('export function voltarViajando('), VIAGEM.indexOf('export function viagemChegou('));

console.log('\npara onde volta cada retrato');
caso('a página de uma playlist volta ao cartão dela nas Playlists, e mais nenhum', () => {
  assert.deepEqual(retratosDaVolta({ name: 'playlist', id: 'p1' }, { name: 'playlists' }), ['playlist:p1']);
});
caso('a página de um artista volta ao cartão dele nos Artists, e a seguir ao do destaque', () => {
  const chaves = retratosDaVolta({ name: 'artist', value: 'Juice WRLD' }, { name: 'artists' })!;
  assert.equal(chaves.length, 2);
  assert.match(chaves[0], /^artista:[^:]+$/);
  assert.equal(chaves[1], `${chaves[0]}:destaque`);
});
caso('o mesmo artista escrito de outra maneira volta ao mesmo cartão (a chave canónica)', () => {
  assert.deepEqual(retratosDaVolta({ name: 'artist', value: 'JUICE WRLD' }, { name: 'artists' }),
    retratosDaVolta({ name: 'artist', value: 'juice wrld' }, { name: 'artists' }));
});
caso('qualquer outro caminho volta como sempre, sem viagem', () => {
  assert.equal(retratosDaVolta({ name: 'playlist', id: 'p1' }, { name: 'search' }), null);
  assert.equal(retratosDaVolta({ name: 'artist', value: 'Drake' }, { name: 'playlists' }), null);
  assert.equal(retratosDaVolta({ name: 'songs' }, { name: 'playlists' }), null);
  assert.equal(retratosDaVolta({ name: 'playlist' }, { name: 'playlists' }), null, 'sem id não há cartão');
  assert.equal(retratosDaVolta({ name: 'artist', value: '' }, { name: 'artists' }), null);
});
caso('quem parte e quem chega escrevem a chave da mesma maneira', () => {
  assert.equal(RETRATO.playlist('x'), 'playlist:x');
  assert.equal(RETRATO.artista('k'), 'artista:k');
  assert.equal(RETRATO.artistaEmDestaque('k'), 'artista:k:destaque');
});

console.log('\na ponte');
caso('o cabeçalho já leva o nome (é o que parte) e o cartão só o ganha ao chegar: nunca dois ao mesmo tempo', () => {
  assert.equal((voltar.match(/setProperty\('view-transition-name'/g) ?? []).length, 1, 'só se nomeia o destino');
  assert.ok(!/origem/.test(voltar), 'a volta não nomeia nenhuma origem: o cabeçalho tem o nome desde sempre');
  assert.match(voltar, /destino\?\.style\.setProperty\('view-transition-name', NOME_DO_RETRATO\);/);
});
caso('NUNCA espera por fotogramas dentro da transição: com a promessa pendente a janela não os corre (a volta ficava presa ~3 s, na 5.5.0)', () => {
  assert.ok(!/requestAnimationFrame|depoisDeQuadros|QUADROS_DE_ASSENTO/.test(VIAGEM.replace(/\/\*[\s\S]*?\*\//g, '')), 'um fotograma esperado dentro do callback nunca chega');
  assert.ok(!/requestAnimationFrame/.test(voltar));
});
caso('nomeia o cartão logo à chegada, o primeiro montado, e cumpre a promessa na hora', () => {
  assert.match(voltar, /aChegar = \(\) => \{\n\s+clearTimeout\(prazo\);\n\s+for \(const chave of chaves\) \{\n\s+const no = retratoDe\(chave\);\n\s+if \(no\) \{ destino = no; break; \}\n\s+\}\n\s+destino\?\.style\.setProperty\('view-transition-name', NOME_DO_RETRATO\);\n\s+cumprir\(\);/);
});
caso('a mesma porta e os mesmos cuidados da ida: prazo, sem API ou "menos movimento" navega como sempre', () => {
  assert.match(voltar, /if \(!chaves \|\| aChegar \|\| !podeViajar\(\)\) \{ mudar\(\); return; \}/);
  assert.match(voltar, /const prazo = setTimeout\(cumprir, ESPERA_MAXIMA_MS\);/);
  assert.match(voltar, /void t\.finished\.then\(limpar, limpar\);/);
  assert.match(voltar, /\} catch \{\n\s+limpar\(\);\n\s+mudar\(\);/);
});
caso('o nome e a marca saem aconteça o que acontecer', () => {
  assert.match(voltar, /const limpar = \(\) => \{ destino\?\.style\.removeProperty\('view-transition-name'\); raiz\.removeAttribute\('data-viagem'\); aChegar = null; \};/);
});
caso('o `viagemChegou` da casca é o que acorda a volta, como na ida', () => {
  assert.match(NAVEGADOR, /useEffect\(\(\) => \{ viagemChegou\(\); \}, \[route\]\);/);
  assert.match(voltar, /aChegar = \(\) => \{/);
});

console.log('\nonde se liga');
caso('o voltar da casca é o único sítio: todas as portas (botão, rato, Esc) passam por ele', () => {
  assert.match(NAVEGADOR, /const para: Route = history\.current\.pop\(\) \|\| \{ name: 'playlists' \};/);
  assert.match(NAVEGADOR, /voltarViajando\(retratosDaVolta\(de, para\), \(\) => mudarRota\(para, \{ volta: true \}\)\);/);
  assert.equal((NAVEGADOR.match(/voltarViajando\(/g) ?? []).length, 1);
});
caso('fechar o Now Playing e avançar não viajam (o `back` do leitor sai antes)', () => {
  const back = NAVEGADOR.slice(NAVEGADOR.indexOf('const back = useCallback('), NAVEGADOR.indexOf('const voltarPeloRato'));
  assert.ok(back.indexOf('if (nowPlayingOpen)') < back.indexOf('voltarViajando('), 'o leitor fecha-se antes de qualquer viagem');
  assert.ok(!/voltarViajando|viajar\(/.test(NAVEGADOR.slice(NAVEGADOR.indexOf('const avancar = useCallback('), NAVEGADOR.indexOf('// Os botões laterais do rato'))));
});
caso('as duas grelhas registam o cartão pela mesma ponte (já não cada uma o seu mapa)', () => {
  assert.ok(!/mosaicos\s*=\s*useRef|retratos\s*=\s*useRef/.test(PLAYLISTS + BIBLIOTECA), 'sobrou um mapa por página');
  assert.match(PLAYLISTS, /ref=\{guardarRetrato\(RETRATO\.playlist\(item\.id\)\) as any\}/);
  assert.match(BIBLIOTECA, /aoMontar=\{guardarRetrato\(RETRATO\.artista\(chave\)\)\}/);
  assert.match(BIBLIOTECA, /aoMontar=\{guardarRetrato\(RETRATO\.artistaEmDestaque\(destaque\.grupo\.chave\)\)\}/);
});
caso('nenhum pedido novo, nenhum temporizador a correr: só fotogramas durante a volta', () => {
  assert.ok(!/fetch\(|supabase|setInterval/.test(VIAGEM));
});

console.log('\nsem "refresh" ao voltar (30/10)');
const CASCA = ler('src/desktop/casca.web.tsx');
const TRANSICAO = ler('src/desktop/TransicaoDePagina.web.tsx');
const UI = ler('src/desktop/ui.web.tsx');
caso('a volta leva a marca na mesma transição que a rota, para a página nascer já calada', () => {
  assert.match(NAVEGADOR, /const mudarRota = useCallback\(\(next: Route, \{ fecharLeitor = false, volta = false \} = \{\}\) => \{/);
  assert.match(NAVEGADOR, /setRoute\(next\);\n\s+setChegouDeVolta\(volta\);/);
  assert.match(NAVEGADOR, /<TransicaoDePagina chave=\{JSON\.stringify\(route\)\} aSair=\{aMudarDePagina\} volta=\{chegouDeVolta\}>/);
});
caso('a página marca-se calada na volta E numa viagem, e a marca fica até à rota seguinte', () => {
  assert.match(TRANSICAO, /if \(volta \|\| document\.documentElement\.hasAttribute\('data-viagem'\)\) no\.setAttribute\('data-chegada', 'calada'\);/);
  assert.match(TRANSICAO, /else no\.removeAttribute\('data-chegada'\);/);
});
caso('o CSS da chegada calada apaga a entrada da página, dos blocos, dos cartões e das linhas', () => {
  const regra = CASCA.slice(CASCA.indexOf('[data-dt~="pagina"][data-chegada="calada"],'));
  for (const alvo of ['"bloco"', '"cartao"', '"fila"']) assert.match(regra.slice(0, 520), new RegExp(`\\[data-dt~=${alvo}\\]`));
  assert.match(regra, /animation: none !important; \}/);
});
caso('nada depende de `html[data-viagem]` para apagar a entrada: tirar um `animation: none` volta a pô-la a correr (a página piscava ao fim da viagem)', () => {
  assert.ok(!/html\[data-viagem\] \[data-dt~="pagina"\]/.test(CASCA));
});
caso('o scroll de uma grelha volta já, antes do primeiro fotograma, e outra vez no seguinte', () => {
  assert.match(UI, /restaurado\.current = true;\n(?:\s+\/\/.*\n)+\s+ref\.current\?\.scrollTo\?\.\(\{ y, animated: false \}\);\n\s+requestAnimationFrame\(\(\) => ref\.current\?\.scrollTo\?\.\(\{ y, animated: false \}\)\);/);
});
caso('os Artists voltam com a grelha montada até onde estavam, e só uma pesquisa a faz recomeçar', () => {
  assert.match(BIBLIOTECA, /^let artistasMontados = PRIMEIRO_LOTE;$/m);
  assert.match(BIBLIOTECA, /const \[pedidos, setPedidos\] = useState\(artistasMontados\);\n\s+useEffect\(\(\) => \{ artistasMontados = pedidos; \}, \[pedidos\]\);/);
  assert.match(BIBLIOTECA, /if \(primeiraPesquisa\.current\) \{ primeiraPesquisa\.current = false; return; \}\n\s+setPedidos\(PRIMEIRO_LOTE\);/);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
