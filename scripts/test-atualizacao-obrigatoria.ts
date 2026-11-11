/**
 * Atualização obrigatória (11/11). Com a app pública, uma versão antiga pode
 * ficar instalada para sempre: o aviso tinha "Not now". Agora uma linha nas notas
 * da versão (o texto da release no GitHub, que o portfólio copia para o
 * `versions.json`) torna-a obrigatória para quem estiver abaixo:
 *
 *     Minimum version: 5.8.7
 *
 * E a versão vai num cabeçalho dos pedidos à API, para um dia o Supabase poder
 * deixar de servir as que não o mandam.
 *
 * O `checkForUpdate` verdadeiro corre numa vm, com o `versions.json` e o disco falsos.
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-atualizacao-obrigatoria.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CABECALHO_DA_VERSAO, criarFetchDoSupabase, definirAparelhoDosPedidos, definirVersaoDosPedidos } from '../src/lib/fetchDoSupabase.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (f: string) => readFileSync(path.join(raiz, f), 'utf8').replace(/\r\n/g, '\n');

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

/** O `lib/updates.ts` verdadeiro, com a versão instalada, o `versions.json` e o disco dados. */
function updates(instalada: string, ios: { version: string; notes: string; install?: string; asset?: object } | null, disco = new Map<string, string>()) {
  const versions = { apps: { duotone: { ios: ios && { tag: `ios-v${ios.version}`, asset: { name: 'Duotone.ipa', size: 1, url: 'x' }, install: 'x', ...ios } } } };
  const stubs: Record<string, unknown> = {
    'react-native': { Platform: { OS: 'ios' } },
    './buildInfo': { APP_VERSION: instalada },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async (k: string) => disco.get(k) ?? null, setItem: async (k: string, v: string) => { disco.set(k, v); },
    } },
  };
  const codigo = ts.transpileModule(ler('src/lib/updates.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext(codigo, {
    module, exports: module.exports, require: (p: string) => { if (p in stubs) return stubs[p]; throw Error(`import inesperado: ${p}`); },
    fetch: async () => ({ ok: true, json: async () => versions }), AbortController, setTimeout, clearTimeout,
  });
  return { m: module.exports, disco };
}

console.log('\na versão mínima nas notas');
{
  const { m } = updates('5.8.6', null);
  await caso('lê a linha, em inglês ou em português, com ou sem v e marcador', () => {
    assert.equal(m.versaoMinimaDasNotas('- Fix\nMinimum version: 5.8.7\n- Outra'), '5.8.7');
    assert.equal(m.versaoMinimaDasNotas('- minimum version:  v5.9'), '5.9');
    assert.equal(m.versaoMinimaDasNotas('Versão mínima: 6.0.0'), '6.0.0');
    assert.equal(m.versaoMinimaDasNotas('- Melhor: a versão mínima do iOS é 17'), null, 'uma frase não é a linha');
    assert.equal(m.versaoMinimaDasNotas(''), null);
  });
  await caso('a linha não aparece nas notas mostradas', () => {
    assert.equal(m.notasSemMinima('- Fix\nMinimum version: 5.8.7\n- Outra'), '- Fix\n- Outra');
  });
}

console.log('\no aviso');
await caso('abaixo da mínima é obrigatória, mesmo depois de um "Not now" a essa versão', async () => {
  const disco = new Map([['update:dismissed:ios', '5.8.7']]);
  const { m } = updates('5.8.6', { version: '5.8.7', notes: '- Menos pedidos\nMinimum version: 5.8.7' }, disco);
  const info = await m.checkForUpdate();
  assert.equal(info?.obrigatoria, true);
  assert.equal(info?.notes, '- Menos pedidos');
});
await caso('sem a linha é o aviso de sempre, e o "Not now" cala-o', async () => {
  const { m } = updates('5.8.6', { version: '5.8.7', notes: '- Menos pedidos' }, new Map([['update:dismissed:ios', '5.8.7']]));
  assert.equal(await m.checkForUpdate(), null);
  const semDispensa = await updates('5.8.6', { version: '5.8.7', notes: '- Menos pedidos' }).m.checkForUpdate();
  assert.equal(semDispensa?.obrigatoria, false);
});
await caso('já na mínima (ou acima), a versão nova é só um aviso', async () => {
  const info = await updates('5.8.7', { version: '5.8.8', notes: 'Minimum version: 5.8.7' }).m.checkForUpdate();
  assert.equal(info?.obrigatoria, false);
});
await caso('sem versão nova não há aviso nenhum, nem com uma mínima acima', async () => {
  assert.equal(await updates('5.8.7', { version: '5.8.7', notes: 'Minimum version: 5.9.0' }).m.checkForUpdate(), null);
});
await caso('obrigatória não se fecha: sem "Not now", sem arrastar, e os passos à vista', () => {
  const folha = ler('src/components/UpdateSheet.tsx');
  assert.match(folha, /const close = \(\) => \{ if \(!ocupada && !update\.obrigatoria\) setUpdate\(null\); \};/);
  assert.match(folha, /<BottomSheet visible onClose=\{close\} gestureBlocked=\{update\.obrigatoria\}>/);
  assert.equal((folha.match(/!update\.obrigatoria && <PillButton label="Not now"/g) ?? []).length, 2, 'nem no PC nem no iPhone');
  assert.match(folha, /if \(info\?\.obrigatoria\) setAjuda\(true\);/);
  assert.match(folha, /\{update\.obrigatoria \? 'Update required' : 'New version available'\}/);
  // No PC o aviso cala-se (a atualização é automática), menos a obrigatória.
  assert.match(folha, /if \(ponte\?\.atualizacaoAutomatica && !update\?\.obrigatoria\) return null;/);
});
await caso('volta a ver ao regressar à frente, no máximo de seis em seis horas', () => {
  const folha = ler('src/components/UpdateSheet.tsx');
  assert.match(folha, /const VER_OUTRA_VEZ_MS = 6 \* 60 \* 60_000;/);
  assert.match(folha, /if \(estado !== 'active' \|\| Date\.now\(\) - verificadoEm < VER_OUTRA_VEZ_MS\) return;/);
});

console.log('\no IPA no iPhone (11/11)');
await caso('o link do IPA é o do portfólio, e sem "install" vale o do ficheiro', async () => {
  const ipa = 'https://github.com/joaoafonso2004/duotone/releases/download/ios-v5.9.3/Duotone.ipa';
  const com = await updates('5.9.2', { version: '5.9.3', notes: '', install: ipa }).m.checkForUpdate();
  assert.equal(com?.install, ipa);
  const sem = await updates('5.9.2', { version: '5.9.3', notes: '', install: '', asset: { name: 'Duotone.ipa', size: 1, url: ipa } }).m.checkForUpdate();
  assert.equal(sem?.install, ipa);
});
await caso('o aviso do iPhone descarrega o IPA, e o Sideloadly fica ao lado', () => {
  const folha = ler('src/components/UpdateSheet.tsx');
  assert.match(folha, /void Linking\.openURL\(update\.install\)\.catch\(\(\) => \{\}\);/);
  assert.match(folha, /update\.platform === 'ios' && !!update\.install \? \(/, 'só no iPhone, e só com link');
  assert.match(folha, /<PillButton label="Download IPA" variant="primary" onPress=\{descarregarIpa\} \/>/);
  assert.match(folha, /<PillButton label="Open Sideloadly" variant="ghost" onPress=\{open\} \/>/);
  assert.match(folha, /SideStore or AltStore/, 'os passos dizem onde abrir o ficheiro');
});

console.log('\na versão nos pedidos');
const REST = 'https://abcdefghijabcdefghij.supabase.co/rest/v1/plays?select=*';
const AUTH = 'https://abcdefghijabcdefghij.supabase.co/auth/v1/token';
async function versaoEnviada(url: string, ponte: boolean): Promise<{ janela: string | null; ponte: string | null }> {
  let janela: string | null = null, pelaPonte: string | null = null;
  const base = (async (_e: RequestInfo | URL, init?: RequestInit) => {
    janela = new Headers(init?.headers).get(CABECALHO_DA_VERSAO);
    return new Response('[]', { status: 200 });
  }) as typeof fetch;
  const p = ponte ? async (x: { headers: [string, string][] }) => {
    pelaPonte = new Map(x.headers).get(CABECALHO_DA_VERSAO) ?? null;
    return { status: 200, statusText: 'OK', headers: [] as [string, string][], corpo: '[]' };
  } : undefined;
  await criarFetchDoSupabase(p, base)(url, { method: 'GET' });
  return { janela, ponte: pelaPonte };
}
await caso('vai em cada pedido à API REST (no iPhone), sem precisar do aparelho', async () => {
  definirAparelhoDosPedidos(null);
  definirVersaoDosPedidos('5.8.7', false);
  assert.equal((await versaoEnviada(REST, false)).janela, '5.8.7');
  assert.equal((await versaoEnviada(AUTH, false)).janela, null);
});
await caso('no PC só pela ponte', async () => {
  definirVersaoDosPedidos('5.8.7', true);
  assert.deepEqual(await versaoEnviada(REST, true), { janela: null, ponte: '5.8.7' });
  definirVersaoDosPedidos(null);
});
await caso('a app manda a sua versão desde o arranque', () => {
  assert.match(ler('src/lib/supabase.ts'), /definirVersaoDosPedidos\(APP_VERSION, Platform\.OS === 'web'\);/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');
