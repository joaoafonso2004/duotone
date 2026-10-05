// Reproduz bibliotecas maiores que a LRU e reinícios reais dos módulos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let agora = Date.now();
class Clock extends Date { static now() { return agora; } }
const storage = new Map();
let escritas = 0;
const asyncStorage = { getItem: async key => storage.get(key) ?? null,
  setItem: async (key, value) => { escritas++; storage.set(key, value); },
  removeItem: async key => { storage.delete(key); } };
function runtime(mocks = {}) {
  const modules = new Map(), timers = [];
  function load(file) {
    const absolute = path.resolve(root, file);
    if (absolute in mocks) return mocks[absolute];
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const module = { exports: {} }; modules.set(absolute, module);
    const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, console, Date: Clock,
      setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout: () => {},
      require: name => {
        if (name.endsWith('trabalhoLocal')) return { medirTrabalho: (_t,fn) => fn(), medirEspera: (_t,fn) => fn(), cederParaInterface: async () => {} };
        if (name === '@react-native-async-storage/async-storage') return asyncStorage;
        if (name in mocks) return mocks[name];
        if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(absolute), name + '.ts')));
        throw Error('Unexpected import: ' + name);
      },
    }, { filename: absolute });
    return module.exports;
  }
  return { load, flush: async () => { while (timers.length) timers.shift()(); await Promise.resolve(); } };
}
const mockFile = (file, value) => ({ [path.resolve(root, file)]: value });
async function main() {
  let leituras = 0;
  const linhas = new Map();
  const supabase = { from: () => ({ select: () => ({ eq: (_, key) => ({ maybeSingle: async () => {
    leituras++; return { data: linhas.get(key) ?? null }; } }) }),
    upsert: async row => { linhas.set(row.cache_key, row); return { error: null }; } }) };
  const mocks = mockFile('src/lib/supabase.ts', { supabase });
  let rt = runtime(mocks), cache = rt.load('src/api/cache.ts');
  const HORA = 3600_000;
  for (let i = 0; i < 900; i++) linhas.set('deezer:teste:' + i, { payload: { nao: true }, fetched_at: new Date(agora).toISOString() });
  for (let i = 0; i < 900; i++) await cache.cacheGet('deezer:teste:' + i, HORA, { memoria: true });
  assert.equal(leituras, 900);
  for (let i = 0; i < 900; i++) await cache.cacheGet('deezer:teste:' + i, HORA, { memoria: true });
  assert.equal(leituras, 900, 'a segunda passagem por 900 nomes não lê o Supabase apesar da LRU de 600');
  await rt.flush();
  rt = runtime(mocks); cache = rt.load('src/api/cache.ts');
  for (let i = 0; i < 900; i++) await cache.cacheGet('deezer:teste:' + i, HORA, { memoria: true });
  assert.equal(leituras, 900, 'reiniciar o processo mantém a poupança');
  linhas.set('conta:preferencias', { payload: 1, fetched_at: new Date(agora).toISOString() });
  await cache.cacheGet('conta:preferencias', HORA);
  linhas.set('conta:preferencias', { payload: 2, fetched_at: new Date(agora).toISOString() });
  assert.equal(await cache.cacheGet('conta:preferencias', HORA), 2, 'dados da conta continuam atuais entre aparelhos');
  agora += 2 * HORA;
  assert.equal(await cache.cacheGet('deezer:teste:0', HORA, { memoria: true }), null, 'a cache respeita a validade');
  const local = rt.load('src/lib/cacheExternaLocal.ts');
  const circular = {}; circular.self = circular;
  await local.guardarCacheExternaLocal('deezer:circular', { payload: circular, em: agora });
  for (let i = 0; i < 3500; i++) await local.guardarCacheExternaLocal('deezer:limite:' + i, { payload: 'x'.repeat(600), em: agora });
  await rt.flush();
  assert.ok(storage.get('duotone:deezer-cache:v1').length < 610_000, 'armazenamento limitado, sem crescimento indefinido');
  console.log('ok - cache: 900 nomes, repetição, reinício, TTL, conta e limite de tamanho');

  storage.clear();
  let consultas = 0, falhar = false;
  const catalogo = { vizinhancaDe: async () => { consultas++; if (falhar) throw Error('offline'); return null; },
    artistaDaFaixa: async () => { consultas++; return null; } };
  const artistMocks = mockFile('src/api/catalogo.ts', catalogo);
  rt = runtime(artistMocks);
  let artist = rt.load('src/api/artistNames.ts');
  const faixas = Array.from({ length: 1700 }, (_, i) => ({ source: 'youtube', title: `Nome Incomum ${i} - Faixa Incomum ${i}`, artist: 'uploads' }));
  await Promise.all([artist.confirmarArtistas(faixas), artist.confirmarArtistas(faixas)]);
  assert.equal(consultas, 6800, 'pedidos simultâneos confirmam cada par uma só vez');
  await artist.confirmarArtistas(faixas);
  assert.equal(consultas, 6800, 'resultados negativos também são lembrados');
  const cacheDeArtistas = rt.load('src/lib/cacheExternaLocal.ts');
  for (let i = 0; i < 6800; i++) await cacheDeArtistas.guardarCacheExternaLocal('deezer:resposta:' + i, { payload: { nao: true }, em: agora });
  await rt.flush();
  rt = runtime(artistMocks); artist = rt.load('src/api/artistNames.ts');
  await artist.confirmarArtistas(faixas);
  assert.equal(consultas, 6800, 'os 1700 pares persistem mesmo após 6800 respostas ultrapassarem a cache');
  const nova = [{ source: 'youtube', title: 'Novo Desconhecido - Outra Desconhecida', artist: 'uploads' }];
  falhar = true; await artist.confirmarArtistas(nova); const antes = consultas;
  falhar = false; await artist.confirmarArtistas(nova);
  assert.ok(consultas > antes, 'uma falha temporária permite tentar de novo');
  console.log('ok - confirmação: 1700 pares, concorrência, negativos persistentes e recuperação de rede');

  storage.clear();
  let conta = 'ana', assinaturas = 0, esperar = null;
  const mediaSupabase = { auth: { getSession: async () => ({ data: { session: conta ? { user: { id: conta } } : null } }) },
    storage: { from: () => ({ createSignedUrl: async p => {
      assinaturas++; const id = conta, n = assinaturas; if (esperar) await esperar;
      return { data: { signedUrl: `https://example/storage/v1/object/sign/profile-covers/${p}?token=${id}-${n}` } };
    } }) } };
  const mediaMocks = { ...mockFile('src/lib/supabase.ts', { supabase: mediaSupabase }), react: {} };
  rt = runtime(mediaMocks); let media = rt.load('src/lib/profileMedia.ts');
  const urls = await Promise.all([media.signedProfileMedia('cover', 'a/cover/x'), media.signedProfileMedia('cover', 'a/cover/x')]);
  assert.equal(urls[0], urls[1]); assert.equal(assinaturas, 1);
  rt = runtime(mediaMocks); media = rt.load('src/lib/profileMedia.ts');
  assert.equal(await media.signedProfileMedia('cover', 'a/cover/x'), urls[0]);
  assert.equal(assinaturas, 1, 'reabrir na mesma conta não cria outro token');
  conta = 'bea'; assert.notEqual(await media.signedProfileMedia('cover', 'a/cover/x'), urls[0]);
  assert.equal(assinaturas, 2, 'a segunda conta pede autorização própria');
  media.clearProfileMediaCache(true);
  assert.equal(storage.has('duotone:profile-links:v1:bea'), false, 'revogação/logout apagam os links guardados');
  conta = 'ana'; agora += 7 * HORA;
  await media.signedProfileMedia('cover', 'a/cover/x'); assert.equal(assinaturas, 3, 'links expirados são renovados');
  let soltar; esperar = new Promise(r => { soltar = r; });
  const antigo = media.signedProfileMedia('cover', 'a/cover/late');
  await new Promise(r => setImmediate(r));
  media.clearProfileMediaCache(true); conta = 'bea';
  esperar = null; await media.signedProfileMedia('cover', 'a/cover/x');
  soltar(); await assert.rejects(antigo, /session has changed/);
  conta = null; await assert.rejects(media.signedProfileMedia('cover', 'a/cover/x'), /expired/);
  console.log('ok - fotos: deduplicação, reinício, isolamento de contas, logout, validade e corrida de sessão');

  storage.clear();
  rt = runtime(); let cores = rt.load('src/lib/cacheDasCores.ts');
  let downloads = 0;
  const ler = async () => { downloads++; return [{ r: 20, g: 40, b: 60 }]; };
  const uri = 'https://example/storage/v1/object/sign/profile-covers/a/cover/x';
  await Promise.all([cores.coresEmCache(uri + '?token=1', ler), cores.coresEmCache(uri + '?token=2', ler)]);
  assert.equal(downloads, 1);
  await rt.flush(); rt = runtime(); cores = rt.load('src/lib/cacheDasCores.ts');
  await cores.coresEmCache(uri + '?token=3', ler); assert.equal(downloads, 1, 'cores persistem sem descarregar a capa');
  await cores.coresEmCache(uri + '-nova?token=4', ler); assert.equal(downloads, 2, 'uma fotografia nova é amostrada');
  assert.equal(storage.get('duotone:cover-colours:v1').includes('token='), false, 'cores não guardam tokens');
  console.log('ok - cores: uma descarga por imagem, partilhada entre montagens e reinícios');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
