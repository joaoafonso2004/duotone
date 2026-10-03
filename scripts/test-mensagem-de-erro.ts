/**
 * A frase de um erro (src/lib/mensagemDeErro.ts) e os ecrãs que deixaram de
 * mostrar o texto técnico num Alert (auditoria 6.1, 3/10).
 *
 * Correr: node --experimental-strip-types scripts/test-mensagem-de-erro.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FRASES, eFraseLegivel, mensagemDeErro } from '../src/lib/mensagemDeErro.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const R = 'Could not add to the playlist.';

console.log('\nos sinais conhecidos');
caso('sem rede', () => {
  assert.equal(mensagemDeErro(new TypeError('Network request failed'), R), FRASES.semRede);
  assert.equal(mensagemDeErro(new Error('TypeError: Failed to fetch'), R), FRASES.semRede);
  assert.equal(mensagemDeErro({ message: 'The Internet connection appears to be offline.' }, R), FRASES.semRede);
});
caso('demorou demais', () => {
  assert.equal(mensagemDeErro(new Error('Request timed out'), R), FRASES.demorou);
  assert.equal(mensagemDeErro({ name: 'AbortError', message: 'Aborted' }, R), FRASES.demorou);
});
caso('o Supabase pelo código, seja qual for o texto', () => {
  assert.equal(mensagemDeErro({ code: 'PGRST202', message: 'Could not find the function public.x(a) in the schema cache' }, R), FRASES.atualizacao);
  assert.equal(mensagemDeErro({ code: '42501', message: 'new row violates row-level security policy for table "playlists"' }, R), FRASES.permissao);
  assert.equal(mensagemDeErro({ code: '23505', message: 'duplicate key value violates unique constraint "x"' }, R), FRASES.jaExiste);
  assert.equal(mensagemDeErro({ code: 'PGRST301', message: 'JWT expired' }, R), FRASES.sessao);
});
caso('HTTP pelo estado', () => {
  assert.equal(mensagemDeErro({ status: 401, message: 'x' }, R), FRASES.sessao);
  assert.equal(mensagemDeErro(new Error('HTTP 503'), R), FRASES.servidor);
  assert.equal(mensagemDeErro(new Error('YouTube API 500: {"error":...}'), R), R, 'o 500 sem "HTTP" não se adivinha, mas o JSON também não passa');
});
caso('a sessão que a app atira', () => {
  assert.equal(mensagemDeErro(new Error('Session expired'), R), FRASES.sessao);
});

console.log('\no texto técnico nunca chega ao ecrã');
for (const t of [
  'new row violates row-level security policy for table "playlists"',
  'Could not find the function public.remover_da_biblioteca(p_ids) in the schema cache',
  'No streamingData',
  'Unexpected token < in JSON at position 0',
  "Cannot read properties of undefined (reading 'id')",
  'YouTube API 403: quotaExceeded',
  'Shared playlist not found',
]) {
  caso(`"${t.slice(0, 50)}"`, () => {
    const m = mensagemDeErro(new Error(t), R);
    assert.notEqual(m, t);
    assert.ok(m === R || Object.values(FRASES).includes(m as never), m);
  });
}

console.log('\nas frases da própria app passam');
for (const t of [
  'This playlist is no longer available to edit.',
  'Invalid playlist link. It must contain "list=".',
  'Could not read this mix. Check your connection and try again.',
  'You cannot add yourself.',
]) {
  caso(`"${t}"`, () => assert.equal(mensagemDeErro(new Error(t), R), t));
}
caso('sem nada, o recurso', () => {
  assert.equal(mensagemDeErro(undefined, R), R);
  assert.equal(mensagemDeErro({}, R), R);
  assert.equal(mensagemDeErro('boom', R), R);
});
caso('uma frase legível tem regras', () => {
  assert.ok(eFraseLegivel('Could not save this playlist.'));
  assert.ok(!eFraseLegivel('could not save'));
  assert.ok(!eFraseLegivel('HTTP 500.'));
  assert.ok(!eFraseLegivel('A'.repeat(120) + '.'));
});

console.log('\nligado');
caso('nenhum ecrã do iPhone mostra "Error" com o texto cru', () => {
  for (const f of ['src/components/AddToPlaylistSheet.tsx', 'src/components/PlayerRoot.tsx', 'src/components/QueueSheet.tsx',
    'src/components/TrackActionsSheet.tsx', 'src/components/YtPlaylistRecommendationSheet.tsx', 'src/screens/ImportYouTubeScreen.tsx',
    'src/screens/PlaylistDetailScreen.tsx', 'src/screens/PlaylistsScreen.tsx', 'src/screens/SearchScreen.tsx',
    'src/screens/SettingsScreen.tsx', 'src/screens/SongsScreen.tsx', 'src/screens/LibraryGroupScreen.tsx',
    'src/components/EscolherArtistas.tsx', 'src/components/AvisoDeRemocao.tsx']) {
    const codigo = readFileSync(f, 'utf8');
    assert.doesNotMatch(codigo, /Alert\.alert\(\s*'Error'/, `${f} ainda abre um "Error"`);
    assert.doesNotMatch(codigo, /Alert\.alert\([^)]*e\??\.message/, `${f} ainda mostra o e.message`);
  }
});
caso('os Alert que ficam são confirmações ou o fim da conta', () => {
  const restantes = ['src/screens/DownloadsScreen.tsx', 'src/screens/SettingsScreen.tsx']
    .flatMap((f) => readFileSync(f, 'utf8').match(/Alert\.alert\(\s*['"`][^'"`]*/g) ?? []);
  for (const r of restantes) assert.match(r, /Remove all|Clear|Delete|Deleted|Sign out|Are you sure/i, r);
});

if (falhas) { console.error(`\n  ${falhas} caso(s) falharam.\n`); process.exit(1); }
console.log('\n  Todos os casos passaram.\n');
