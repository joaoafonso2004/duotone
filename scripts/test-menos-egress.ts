/**
 * Menos egress (11/11). Medido nos logs do Supabase numa hora: das 35 037 linhas
 * que a API devolveu, 15 076 eram o histórico de escutas a ser descarregado
 * inteiro pelas estatísticas, e 6 900 a tabela dos ajustes por faixa relida 47
 * vezes. O egress é o limite do plano grátis que desliga a app (402).
 *
 *   - as escutas da própria conta ficam guardadas no aparelho e pede-se só o
 *     que é novo (com folga para as atrasadas); de semana a semana relê-se tudo;
 *   - os ajustes leem-se inteiros ao arrancar e de 6 em 6 h; entre elas, só as
 *     linhas editadas; o aviso do Realtime junta-se sem reler.
 *
 * Os módulos verdadeiros correm numa vm, com o Supabase e o disco falsos a contar.
 * Correr: node --experimental-strip-types scripts/test-menos-egress.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  ACABADO_DE_LER_MS, FOLGA_DAS_NOVAS_MS, RELER_TUDO_MS,
  aPartirDe, cobre, compactar, descompactar, juntarEscutas, lerGuardado, planoDeLeitura,
} from '../src/lib/historicoDeEscutas.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (f: string) => readFileSync(path.join(raiz, f), 'utf8').replace(/\r\n/g, '\n');

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).stack ?? (e as Error).message}`); }
}

const DIA = 86_400_000;
const T0 = Date.parse('2026-11-11T12:00:00.000Z');
const escuta = (em: number, id = 'a', extra: Partial<Record<string, unknown>> = {}) => ({
  playedAt: new Date(em).toISOString(), source: 'youtube', sourceId: id, title: `t-${id}`,
  artist: 'Artista', artworkUrl: `https://i.ytimg.com/vi/${id}/hq.jpg`, durationSeconds: 200, ...extra,
});

console.log('\no histórico guardado (as contas)');
await caso('sem nada guardado, ou de outra conta, ou com uma semana, lê o período inteiro', () => {
  assert.deepEqual(planoDeLeitura(null, 'eu', null, T0), { tipo: 'tudo', desde: null });
  const h = compactar('eu', [], { lidoEm: T0, leituraEm: T0, desde: null, truncado: false });
  assert.deepEqual(planoDeLeitura(h, 'outro', null, T0 + 120_000), { tipo: 'tudo', desde: null });
  assert.deepEqual(planoDeLeitura(h, 'eu', T0 - DIA, T0 + RELER_TUDO_MS), { tipo: 'tudo', desde: T0 - DIA });
});
await caso('acabado de ler não vai à rede; depois pede só o novo, com dois dias de folga', () => {
  const h = compactar('eu', [], { lidoEm: T0, leituraEm: T0, desde: null, truncado: false });
  assert.deepEqual(planoDeLeitura(h, 'eu', T0 - 30 * DIA, T0 + ACABADO_DE_LER_MS - 1), { tipo: 'nada' });
  assert.deepEqual(planoDeLeitura(h, 'eu', T0 - 30 * DIA, T0 + 5 * 60_000), { tipo: 'novas', desde: T0 - FOLGA_DAS_NOVAS_MS });
});
await caso('um período mais antigo do que o guardado lê-se inteiro', () => {
  const h = compactar('eu', [], { lidoEm: T0, leituraEm: T0, desde: T0 - 30 * DIA, truncado: false });
  assert.equal(cobre(h, T0 - 29 * DIA), true);
  assert.equal(cobre(h, T0 - 31 * DIA), false);
  assert.equal(cobre(h, null), false);
  assert.deepEqual(planoDeLeitura(h, 'eu', null, T0 + 5 * 60_000), { tipo: 'tudo', desde: null });
});
await caso('a mesma escuta conta uma vez, fica a versão nova, e a ordem é da mais recente', () => {
  const velhas = [escuta(T0 - 1000, 'a'), escuta(T0 - 5000, 'b')];
  const novas = [escuta(T0, 'c'), escuta(T0 - 1000, 'a', { artworkUrl: 'nova' })];
  const juntas = juntarEscutas(velhas, novas);
  assert.deepEqual(juntas.map((r) => r.sourceId), ['c', 'a', 'b']);
  assert.equal(juntas[1].artworkUrl, 'nova');
  assert.deepEqual(aPartirDe(juntas, T0 - 2000).map((r) => r.sourceId), ['c', 'a']);
});
await caso('compactar e voltar dá as mesmas escutas, com cada faixa guardada uma vez', () => {
  const rows = [escuta(T0, 'a'), escuta(T0 - 1, 'b'), escuta(T0 - 2, 'a'), escuta(T0 - 3, 'a')];
  const h = compactar('eu', rows, { lidoEm: T0, leituraEm: T0, desde: null, truncado: false });
  assert.equal(h.faixas.length, 2);
  assert.deepEqual(descompactar(h), rows);
  const disco = JSON.stringify(h);
  assert.deepEqual(lerGuardado(disco, 'eu'), h);
  assert.equal(lerGuardado(disco, 'outra'), null, 'o de outra conta não serve');
  assert.equal(lerGuardado('{lixo', 'eu'), null);
  assert.equal(lerGuardado(JSON.stringify({ ...h, v: 2 }), 'eu'), null);
});

// ---------------------------------------------------------------------------
// Os módulos verdadeiros, numa vm, com o Supabase e o disco falsos.
type Pedido = { tabela: string; filtros: [string, string, unknown][]; range?: [number, number]; rpc?: string };
function mundo(opcoes: {
  escutas: () => { user_id: string; played_at: string; tracks: Record<string, unknown> }[];
  ajustes?: () => Record<string, unknown>[];
  disco: Map<string, string>;
  agora: { t: number };
  falhar?: { sim: boolean };
}) {
  const pedidos: Pedido[] = [];
  function construtor(tabela: string) {
    const p: Pedido = { tabela, filtros: [] };
    const b: any = {
      select: () => b,
      eq: (c: string, v: unknown) => { p.filtros.push(['eq', c, v]); return b; },
      gte: (c: string, v: unknown) => { p.filtros.push(['gte', c, v]); return b; },
      order: () => b,
      range: (a: number, z: number) => { p.range = [a, z]; return b; },
      then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => {
        pedidos.push(p);
        if (opcoes.falhar?.sim) return Promise.resolve({ data: null, error: { message: 'sem rede' } }).then(ok, ko);
        let linhas: any[] = tabela === 'plays' ? opcoes.escutas() : (opcoes.ajustes?.() ?? []);
        for (const [op, c, v] of p.filtros) {
          linhas = linhas.filter((l) => op === 'eq' ? l[c] === v : Date.parse(l[c]) >= Date.parse(String(v)));
        }
        if (tabela === 'plays') linhas.sort((a, z) => Date.parse(z.played_at) - Date.parse(a.played_at));
        const [a, z] = p.range ?? [0, linhas.length - 1];
        return Promise.resolve({ data: linhas.slice(a, z + 1), error: null }).then(ok, ko);
      },
    };
    return b;
  }
  const supabase = {
    from: (t: string) => construtor(t),
    rpc: (nome: string) => { pedidos.push({ tabela: '', filtros: [], rpc: nome }); return Promise.resolve({ data: [], error: null }); },
  };
  const asyncStorage = {
    __esModule: true,
    default: {
      getItem: async (k: string) => opcoes.disco.get(k) ?? null,
      setItem: async (k: string, v: string) => { opcoes.disco.set(k, v); },
      removeItem: async (k: string) => { opcoes.disco.delete(k); },
    },
  };
  class Relogio extends Date {
    constructor(...a: unknown[]) { super(...(a.length ? a : [opcoes.agora.t]) as []); }
    static now() { return opcoes.agora.t; }
  }
  const stubs: Record<string, unknown> = {
    'src/lib/supabase.ts': { supabase },
    'src/lib/idDaConta.ts': { idDaConta: async () => 'eu' },
    'src/lib/artistName.ts': { displayArtist: (t: { artist: string | null }) => t.artist },
    '@react-native-async-storage/async-storage': asyncStorage,
  };
  const modulos = new Map<string, { exports: any }>();
  function carregar(relativo: string): any {
    if (stubs[relativo]) return stubs[relativo];
    if (modulos.has(relativo)) return modulos.get(relativo)!.exports;
    const ficheiro = path.join(raiz, relativo);
    const codigo = ts.transpileModule(readFileSync(ficheiro, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} as any };
    modulos.set(relativo, module);
    const contexto = vm.createContext({
      module, exports: module.exports, console, setTimeout, clearTimeout, Date: Relogio, JSON, Math, Promise,
      require: (pedido: string) => {
        if (stubs[pedido]) return stubs[pedido];
        if (!pedido.startsWith('.')) return require(pedido);
        const destino = path.relative(raiz, path.resolve(path.dirname(ficheiro), pedido)).replaceAll('\\', '/');
        return carregar(destino.endsWith('.ts') ? destino : `${destino}.ts`);
      },
    });
    vm.runInContext(codigo, contexto, { filename: ficheiro });
    return module.exports;
  }
  return { carregar, pedidos };
}

const linhaDeEscuta = (em: number, id: string, conta = 'eu') => ({
  user_id: conta, played_at: new Date(em).toISOString(),
  tracks: { source: 'youtube', source_id: id, title: `t-${id}`, artist: 'A', artwork_url: null, duration_seconds: 200 },
});

console.log('\nas estatísticas, com o Supabase a contar');
{
  const agora = { t: T0 };
  const disco = new Map<string, string>();
  const falhar = { sim: false };
  // 2 500 escutas, uma a cada meia hora para trás (52 dias): três páginas de 1000.
  const MEIA_HORA = 30 * 60_000;
  let tabela = Array.from({ length: 2500 }, (_, i) => linhaDeEscuta(T0 - MEIA_HORA * (i + 1), `f${i % 300}`));
  tabela.push(linhaDeEscuta(T0 - 1000, 'alheia', 'outra-conta'));
  const m = mundo({ escutas: () => tabela, disco, agora, falhar });
  const api = m.carregar('src/api/listeningStats.ts');
  const plays = () => m.pedidos.filter((p) => p.tabela === 'plays');

  await caso('a primeira abertura lê o histórico às páginas, só da conta, e guarda-o', async () => {
    const r = await api.lerReproducoes(null);
    assert.equal(r.unavailable, false);
    assert.equal(r.rows.length, 2500);
    assert.equal(plays().length, 3, 'três páginas de 1000');
    assert.ok(plays().every((p) => p.filtros.some(([op, c, v]) => op === 'eq' && c === 'user_id' && v === 'eu')));
    assert.ok(disco.get('historico-de-escutas:v1:eu'), 'ficou no disco');
  });
  await caso('voltar logo a seguir (outro período) não vai à rede', async () => {
    const antes = plays().length;
    const r = await api.lerReproducoes(T0 - 30 * DIA);
    assert.equal(plays().length, antes);
    assert.equal(r.rows.length, 30 * 48, 'só as dos 30 dias');
    const poucas = await api.lerReproducoes(T0 - MEIA_HORA * 100 - 1);
    assert.equal(poucas.rows.length, 100, 'o período filtra o que está guardado');
  });
  await caso('mais tarde pede só o novo: um pedido, desde a última leitura menos dois dias', async () => {
    agora.t = T0 + 3 * 60 * 60_000;
    tabela = [...tabela, linhaDeEscuta(T0 + 60 * 60_000, 'nova'),
      // Ouvida sem rede um dia antes e só agora enviada: cabe na folga.
      linhaDeEscuta(T0 - DIA, 'atrasada')];
    const antes = plays().length;
    const r = await api.lerReproducoes(null);
    assert.equal(plays().length - antes, 1);
    const gte = plays().at(-1)!.filtros.find(([op]) => op === 'gte');
    assert.equal(gte?.[2], new Date(T0 - FOLGA_DAS_NOVAS_MS).toISOString());
    assert.equal(r.rows.length, 2502, 'a nova e a atrasada entram, as repetidas não');
    assert.equal(r.rows[0].sourceId, 'nova');
    assert.ok(r.rows.some((x: { sourceId: string }) => x.sourceId === 'atrasada'));
  });
  await caso('outra abertura da app parte do disco: só o novo outra vez', async () => {
    agora.t = T0 + 5 * 60 * 60_000;
    const outra = mundo({ escutas: () => tabela, disco, agora });
    const r = await outra.carregar('src/api/listeningStats.ts').lerReproducoes(null);
    assert.equal(outra.pedidos.filter((p) => p.tabela === 'plays').length, 1);
    assert.equal(r.rows.length, 2502);
  });
  await caso('sem rede, o que está guardado continua a servir', async () => {
    agora.t = T0 + 6 * 60 * 60_000;
    falhar.sim = true;
    const r = await api.lerReproducoes(T0 - 30 * DIA);
    falhar.sim = false;
    assert.equal(r.unavailable, false);
    assert.equal(r.rows.length, 30 * 48 + 2, 'as dos 30 dias, com a nova e a atrasada');
  });
  await caso('passada uma semana relê o período inteiro', async () => {
    agora.t = T0 + RELER_TUDO_MS + 1;
    const antes = plays().length;
    const r = await api.lerReproducoes(null);
    assert.equal(plays().length - antes, 3);
    assert.equal(r.rows.length, 2502);
  });
  await caso('as de um amigo continuam pela função dele, sem guardar', async () => {
    const antes = m.pedidos.length;
    await api.lerReproducoes(null, 'amigo');
    await api.lerReproducoes(null, 'amigo');
    assert.deepEqual(m.pedidos.slice(antes).map((p) => p.rpc), ['get_social_profile_plays', 'get_social_profile_plays']);
  });
  await caso('duas leituras ao mesmo tempo esperam pela mesma', async () => {
    agora.t += 10 * 60_000;
    const antes = plays().length;
    await Promise.all([api.lerReproducoes(null), api.lerReproducoes(null)]);
    assert.equal(plays().length - antes, 1);
  });
  await caso('já não pede a sessão ao Auth a cada leitura', () => {
    const fonte = ler('src/api/listeningStats.ts');
    assert.doesNotMatch(fonte, /auth\.getUser\(\)/);
    assert.match(fonte, /const conta = await idDaConta\(\);/);
  });
}

console.log('\nos ajustes por faixa');
{
  const agora = { t: T0 };
  const linhas = [
    { user_id: 'eu', source: 'youtube', source_id: 'a', rate: 1.1, gains: null, seen_at: new Date(T0 - 10 * DIA).toISOString() },
    { user_id: 'eu', source: 'youtube', source_id: 'b', rate: 0.9, gains: null, seen_at: new Date(T0 - 60_000).toISOString() },
  ];
  const m = mundo({ escutas: () => [], ajustes: () => linhas, disco: new Map(), agora });
  const ajustes = m.carregar('src/api/ajustes.ts');
  const sync = m.carregar('src/lib/adjustmentSync.ts');

  await caso('sem `desde` lê a tabela inteira; com ele, só as linhas editadas desde então', async () => {
    const todas = await ajustes.lerAjustesRemotos('eu');
    assert.deepEqual(Object.keys(todas).sort(), ['youtube:a', 'youtube:b']);
    const novas = await ajustes.lerAjustesRemotos('eu', T0 - 60 * 60_000);
    assert.deepEqual(Object.keys(novas), ['youtube:b']);
    assert.equal(m.pedidos.at(-1)!.filtros.find(([op]) => op === 'gte')?.[2], new Date(T0 - 60 * 60_000).toISOString());
  });
  await caso('a primeira leitura e a de seis em seis horas são inteiras; as outras, desde a anterior menos a folga', () => {
    const { desdeQuandoLer, LEITURA_INTEIRA_MS, FOLGA_DA_LEITURA_MS } = sync;
    assert.equal(desdeQuandoLer(0, 0, T0), null);
    assert.equal(desdeQuandoLer(T0, T0 + 1000, T0 + 2000), T0 + 1000 - FOLGA_DA_LEITURA_MS);
    assert.equal(desdeQuandoLer(T0, T0 + 1000, T0 + LEITURA_INTEIRA_MS), null);
    assert.equal(desdeQuandoLer(T0 + 5000, T0 + 5000, T0), null, 'um relógio que andou para trás relê tudo');
  });
  await caso('o aviso do Realtime junta-se sem reler, e o mais recente ganha', async () => {
    let leituras = 0;
    const aplicados: Record<string, any>[] = [];
    const motor = new sync.AdjustmentSync({
      readLocal: async () => ({ values: { 'youtube:a': { rate: 1, ganhos: null, visto: 500 } }, pending: {} }),
      writeLocal: async () => {}, readRemote: async () => { leituras++; return {}; }, writeRemote: async () => {},
      apply: (v: Record<string, any>) => aplicados.push(v), status: () => {},
    });
    motor.receber({ 'youtube:a': { rate: 1.5, ganhos: null, visto: 900 } });
    motor.receber({ 'youtube:a': { rate: 0.5, ganhos: null, visto: 100 } });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(leituras, 0);
    assert.equal(aplicados.at(-1)!['youtube:a'].rate, 1.5);
    assert.equal(motor.jaSabe('youtube:a', 900), true);
    motor.stop();
  });
  await caso('uma linha do aviso lê-se como uma lida; incompleta, não', () => {
    const l = ajustes.linhaDoAjuste({ source: 'youtube', source_id: 'x', rate: 1.2, gains: null, seen_at: new Date(T0).toISOString() });
    // Em JSON: o array vem de dentro da vm, com outro `Array`.
    assert.equal(JSON.stringify(l), JSON.stringify(['youtube:x', { rate: 1.2, ganhos: null, visto: T0 }]));
    assert.equal(ajustes.linhaDoAjuste({ source: 'youtube', seen_at: 'x' }), null);
    assert.equal(ajustes.linhaDoAjuste(null), null);
  });
  await caso('a loja usa a leitura parcial, o aviso, e no iPhone a mesma regra do PC ao voltar', () => {
    const fonte = ler('src/state/trackAdjustments.ts');
    assert.match(fonte, /desde=desdeQuandoLer\(ultimaInteira,ultimaLeitura,agora\);/);
    assert.match(fonte, /const lidos=await lerAjustesRemotos\(userId,desde\);/);
    assert.match(fonte, /engine\.receber\(\{\[linha\[0\]\]:linha\[1\]\}\)/);
    assert.match(fonte, /if\(s==='pending'\|\|s==='error'\)flush\(\);else aoFocar\(\);/,
      'ao voltar: com algo por enviar sincroniza logo; senão, a janela dos cinco minutos');
    assert.doesNotMatch(fonte, /if\(Platform\.OS==='web'\)aoFocar\(\);else flush\(\);/, 'o iPhone já não relê a cada regresso');
  });
}

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');
