/**
 * Menos linhas de log no Supabase com a app pública (11/11). Numa hora medida,
 * os caminhos mais pedidos eram o `yt_cache` (~1 000), a presença (641) e o
 * `track_catalog` (274). Este teste prende os três cortes:
 *
 * - o `track_catalog` fica no aparelho (`lib/catalogoNoAparelho.ts`): o que a
 *   tabela já respondeu não se volta a perguntar, e o que ela não tinha só ao
 *   fim de uma semana; as escritas saem em lote;
 * - a presença só publica uma mudança na fila quando as próximas que os amigos
 *   veem mudam;
 * - os metadados do Deezer não vão ao `yt_cache` (esse está em
 *   `test-cache-em-memoria.cjs`).
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-duplos.mjs scripts/test-menos-logs.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import AsyncStorage from './duplos/async-storage.ts';
import {
  esquecerCatalogoNoAparelho, FALTA_VALE_MS, guardarRespostaNoAparelho, lembrarNoAparelho, lerDoAparelho,
} from '../src/lib/catalogoNoAparelho.ts';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const faixa = (artista: string) => ({
  artista, titulo: 'T', album: null, genero: null, ano: null, capa: null, prova: 'artista' as const,
});

console.log('\no track_catalog no aparelho');
await caso('o que a tabela respondeu fica sabido; o que não tinha espera uma semana', async () => {
  esquecerCatalogoNoAparelho();
  await AsyncStorage.removeItem('duotone:track-catalog:v1');
  const agora = 1_000_000;
  const primeira = await lerDoAparelho(['youtube:a', 'youtube:b', 'youtube:c'], agora);
  assert.deepEqual(primeira.porPerguntar, ['youtube:a', 'youtube:b', 'youtube:c'], 'ao início pergunta-se tudo');
  await guardarRespostaNoAparelho(new Map([['youtube:a', faixa('A')]]), ['youtube:a', 'youtube:b'], agora);
  const segunda = await lerDoAparelho(['youtube:a', 'youtube:b', 'youtube:c'], agora + 1000);
  assert.equal(segunda.sabidas.get('youtube:a')?.artista, 'A');
  assert.deepEqual(segunda.porPerguntar, ['youtube:c'], 'a que faltou não volta logo; a que ninguém perguntou sim');
  const depois = await lerDoAparelho(['youtube:b'], agora + FALTA_VALE_MS + 1);
  assert.deepEqual(depois.porPerguntar, ['youtube:b'], 'ao fim de uma semana volta a perguntar-se');
});
await caso('uma faixa resolvida aqui fica sabida', async () => {
  esquecerCatalogoNoAparelho();
  await lembrarNoAparelho('youtube:z', faixa('Z'));
  assert.equal((await lerDoAparelho(['youtube:z'])).sabidas.get('youtube:z')?.artista, 'Z');
});
await caso('sobrevive a fechar a app (fica no disco)', async () => {
  esquecerCatalogoNoAparelho();
  await AsyncStorage.removeItem('duotone:track-catalog:v1');
  await lembrarNoAparelho('youtube:d', faixa('D'));
  await new Promise((r) => setTimeout(r, 2_100));
  esquecerCatalogoNoAparelho();
  assert.equal((await lerDoAparelho(['youtube:d'])).sabidas.get('youtube:d')?.artista, 'D');
});

console.log('\no track_catalog na API');
await caso('a leitura passa primeiro pelo aparelho, e só guarda as faltas de lotes respondidos', () => {
  const api = ler('src/api/catalogoDeFaixas.ts');
  assert.match(api, /await lerDoAparelho\(pedidas\.map\(/);
  assert.match(api, /if \(!aPerguntar\.has\(chaveDoCatalogo\(c\.source, c\.sourceId\)\)\) continue;/);
  assert.match(api, /if \(error \|\| !data\) continue;\n\s+for \(const id of unicos\.slice\(i, i \+ LOTE\)\) respondidas\.push/);
  assert.match(api, /if \(respondidas\.length\) void guardarRespostaNoAparelho\(doServidor, respondidas\);/);
});
await caso('as escritas saem num lote, e não uma por faixa', () => {
  const api = ler('src/api/catalogoDeFaixas.ts');
  assert.match(api, /const ESPERA_DO_LOTE_MS = 5_000;/);
  assert.match(api, /supabase\.from\('track_catalog'\)\.upsert\(linhas, opcoes\)/);
  const guardar = api.slice(api.indexOf('export async function guardarNoCatalogo'), api.indexOf('export async function marcarSemEdicao'));
  assert.doesNotMatch(guardar, /\.upsert\(/, 'o guardarNoCatalogo já não escreve sozinho');
  const marcar = api.slice(api.indexOf('export async function marcarSemEdicao'));
  assert.doesNotMatch(marcar.slice(0, marcar.indexOf('\n}\n')), /\.upsert\(/, 'nem o marcarSemEdicao');
});

console.log('\na presença');
await caso('uma mudança na fila só publica se as próximas que os amigos veem mudam', () => {
  const p = ler('src/lib/presenceSync.ts');
  assert.match(p, /else if \(s\.isPlaying && filaMudou && filaQueOsAmigosVeem\(\) !== filaPublicada\) changed\(\);/);
  assert.match(p, /ultimoEnviado = \{ chave, essencial, em: agora \};\n\s+filaPublicada = assinaturaDaFila\(aSeguir\);/);
});
await caso('o que não se vê espera pelo acerto de 5 min; um engasgo não tira a música (11/11)', () => {
  const p = ler('src/lib/presenceSync.ts');
  assert.match(p, /export const MINIMO_ENTRE_ACERTOS_MS = 300_000;/);
  assert.match(p, /const essencial = JSON\.stringify\(\[ativo && !encerrar, encerrar, privada, faixa\?\.source, faixa\?\.sourceId\]\);/);
  assert.match(p, /const janela = Math\.min\(MINIMO_ENTRE_ACERTOS_MS, batimentoMs\);/, 'nunca para lá do batimento');
  assert.match(p, /if \(!encerrar && ultimoEnviado\?\.essencial === essencial && desdeOUltimo < janela\) \{/);
  assert.match(p, /const faixa = s\.current && s\.isPlaying && s\.playbackConfirmed && !s\.error \? s\.current : null;/);
  // O comportamento em si está no test-escuta-ao-vivo.cjs (relógio virtual).
});

console.log('\no coração do leitor do iPhone');
await caso('vem do conjunto local; o servidor só enquanto ele não chegou, e o id só ao tirar (11/11)', () => {
  const p = ler('src/components/PlayerRoot.tsx');
  assert.match(p, /if\(guardadas\.loaded\)\{setSaved\(guardadas\.keys\.has\(savedKey\(current\)\)\);setDbTrackId\(null\);\}\n\s+else checkIsSaved\(/);
  assert.match(p, /if \(!idToRemove\) \{\n\s+const res = await checkIsSaved\(current\.source, current\.sourceId\);/, 'tirar pede o id quando falta');
});

console.log('\nos eventos');
await caso('só saem os eventos que o servidor guarda, e a mesma lista do SQL (11/11)', () => {
  const ev = ler('src/lib/eventos.ts');
  const sqlTexto = ler('supabase/caber-no-plano-gratis.sql');
  const doSql = (sqlTexto.match(/if new\.nome = any \(array\[([\s\S]*?)\]\)/)?.[1] ?? '').match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
  const doCliente = (ev.match(/EVENTOS_QUE_O_SERVIDOR_GUARDA: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? '').match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
  assert.ok(doSql.length > 5, 'leu a lista do SQL');
  assert.deepEqual([...doCliente].sort(), [...doSql].sort(), 'a app e o servidor guardam os mesmos');
  assert.match(ev, /\? porEnviar\.filter\(\(e\) => EVENTOS_QUE_O_SERVIDOR_GUARDA\.has\(e\.nome\)\)/);
  assert.match(ev, /if \(!lote\.length\) return;/, 'um lote vazio não faz pedido');
  assert.match(ev, /void souAdministrador\(userId\)\.then\(\(sim\) => \{ if \(utilizador === userId\) soOsQueOServidorGuarda = !sim; \}\);/, 'o administrador manda tudo');
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');
