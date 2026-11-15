/**
 * Descarregar uma playlist inteira (15/11): as contas e as frases
 * (lib/downloadDaLista.ts), a ordem do lote (lib/loteDeDownloads.ts, com
 * duplos) e as ações no menu da playlist (lib/menuDaPlaylist.ts).
 *
 * Correr: node --experimental-strip-types scripts/test-download-da-lista.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  contarDaLista, downloadDaLista, faltamDescarregar, textoDoDescarregado, textoDoProgresso, textoDoTamanho,
} from '../src/lib/downloadDaLista.ts';
import { criarLotesDeDownload, FALHAS_SEGUIDAS_PARA_PARAR, PAUSA_ENTRE_MUSICAS_MS } from '../src/lib/loteDeDownloads.ts';
import { menuDaPlaylist } from '../src/lib/menuDaPlaylist.ts';

let falhas = 0;
async function caso(nome: string, fn: () => void | Promise<void>) {
  try { await fn(); console.log(`  ok - ${nome}`); }
  catch (e: any) { falhas++; console.error(`  FALHOU - ${nome}\n    ${e.message}`); }
}

// --- As contas e as frases --------------------------------------------------

await caso('contar: só as descarregadas contam como feitas', () => {
  const c = contarDaLista(['descarregada', 'nenhum', 'a-descarregar', 'em-falta', 'descarregada']);
  assert.deepEqual(c, { total: 5, descarregadas: 2 });
  assert.equal(downloadDaLista(c), 'parcial');
  assert.equal(downloadDaLista({ total: 3, descarregadas: 3 }), 'completo');
  assert.equal(downloadDaLista({ total: 3, descarregadas: 0 }), 'nenhum');
  assert.equal(downloadDaLista({ total: 0, descarregadas: 0 }), 'nenhum');
});

await caso('faltam: as por pedir e as em falta, pela ordem da lista', () => {
  const s: Record<string, any> = { a: 'descarregada', b: 'nenhum', c: 'a-descarregar', d: 'em-falta' };
  assert.deepEqual(faltamDescarregar(['a', 'b', 'c', 'd'], (x) => s[x]), ['b', 'd']);
});

await caso('as frases da linha de progresso', () => {
  const c = { total: 403, descarregadas: 12 };
  assert.equal(textoDoProgresso(c, null), 'Downloading 12 of 403');
  assert.equal(textoDoProgresso(c, 'wifi'), 'Waiting for Wi-Fi · 12 of 403');
  assert.equal(textoDoProgresso(c, 'rede'), 'Waiting for a connection · 12 of 403');
  assert.equal(textoDoDescarregado({ total: 403, descarregadas: 403 }), 'Downloaded · 403 songs');
  assert.equal(textoDoDescarregado({ total: 1, descarregadas: 1 }), 'Downloaded · 1 song');
  assert.equal(textoDoDescarregado(c), '12 of 403 downloaded');
});

await caso('o tamanho aproximado (~128 kbps; 3,5 min sem duração)', () => {
  assert.equal(textoDoTamanho([240]), 'about 4 MB');
  assert.equal(textoDoTamanho(Array(100).fill(210)), 'about 340 MB');
  assert.equal(textoDoTamanho(Array(403).fill(null)), 'about 1.4 GB');
});

// --- O lote, com duplos -----------------------------------------------------

type F = { id: string; falha?: boolean };
function montar(opcoes: { emDisco?: string[]; semRede?: boolean; dadosMoveis?: boolean } = {}) {
  const disco = new Set(opcoes.emDisco ?? []);
  const pedidos = new Set<string>();
  const registo: string[] = [];
  const rede = { semRede: !!opcoes.semRede, dadosMoveis: !!opcoes.dadosMoveis };
  let acordar: (() => void) | null = null;
  let largarPedido: (() => void) | null = null;
  let segurar = false;
  const lotes = criarLotesDeDownload<F>({
    id: (t) => t.id,
    jaTratada: (t) => pedidos.has(t.id) && disco.has(t.id),
    emDisco: (t) => disco.has(t.id),
    async pedir(t) {
      registo.push(`pedir ${t.id}`);
      pedidos.add(t.id);
      if (segurar) await new Promise<void>((r) => { largarPedido = r; });
      if (t.falha) return false;
      disco.add(t.id);
      return true;
    },
    async tirar(id) { registo.push(`tirar ${id}`); pedidos.delete(id); disco.delete(id); },
    semRede: () => rede.semRede,
    dadosMoveis: () => rede.dadosMoveis,
    esperarPelaRede: () => new Promise<void>((r) => { registo.push('esperar'); acordar = r; }),
    async pausa(ms) { registo.push(`pausa ${ms}`); },
    aoMudar() {},
  });
  const mudarRede = (m: Partial<typeof rede>) => { Object.assign(rede, m); const a = acordar; acordar = null; a?.(); };
  const vazia = () => new Promise((r) => setTimeout(r, 0));
  const segurarPedidos = (sim: boolean) => { segurar = sim; };
  const largar = () => { const l = largarPedido; largarPedido = null; l?.(); };
  return { lotes, registo, disco, pedidos, mudarRede, vazia, segurarPedidos, largar };
}
const ate = async (cond: () => boolean) => { for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 0)); };

await caso('uma de cada vez, pela ordem, com pausa só depois de um download a sério', async () => {
  const m = montar({ emDisco: ['b'] });
  m.lotes.juntar('pl:1', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  await ate(() => !m.lotes.estado('pl:1').aCorrer);
  assert.deepEqual(m.registo, ['pedir a', `pausa ${PAUSA_ENTRE_MUSICAS_MS}`, 'pedir b', 'pedir c', `pausa ${PAUSA_ENTRE_MUSICAS_MS}`]);
});

await caso('as que já estão descarregadas saltam-se', async () => {
  const m = montar({ emDisco: ['a'] });
  m.pedidos.add('a');
  m.lotes.juntar('pl:1', [{ id: 'a' }, { id: 'b' }]);
  await ate(() => !m.lotes.estado('pl:1').aCorrer);
  assert.deepEqual(m.registo.filter((r) => r.startsWith('pedir')), ['pedir b']);
});

await caso('sem rede espera, e retoma quando a rede volta', async () => {
  const m = montar({ semRede: true });
  m.lotes.juntar('pl:1', [{ id: 'a' }]);
  await m.vazia();
  assert.deepEqual(m.lotes.estado('pl:1'), { aCorrer: true, espera: 'rede', parouPorFalhas: false });
  assert.deepEqual(m.registo, ['esperar']);
  m.mudarRede({ semRede: false });
  await ate(() => !m.lotes.estado('pl:1').aCorrer);
  assert.ok(m.disco.has('a'));
});

await caso('em dados móveis espera pelo Wi-Fi, até se dar licença', async () => {
  const m = montar({ dadosMoveis: true });
  m.lotes.juntar('pl:1', [{ id: 'a' }, { id: 'b' }]);
  await m.vazia();
  assert.equal(m.lotes.estado('pl:1').espera, 'wifi');
  assert.ok(!m.registo.includes('pedir a'));
  // Sem a rede mudar: a licença acorda o lote sozinha.
  m.lotes.permitirDadosMoveis('pl:1');
  await ate(() => !m.lotes.estado('pl:1').aCorrer);
  assert.ok(m.disco.has('a') && m.disco.has('b'), 'com licença, descarrega em dados móveis');
});

await caso('cancelar enquanto espera pelo Wi-Fi liberta a fila logo', async () => {
  const m = montar({ dadosMoveis: true });
  m.lotes.juntar('pl:1', [{ id: 'a' }]);
  await m.vazia();
  await m.lotes.cancelar('pl:1');
  await ate(() => !m.lotes.estado('pl:1').aCorrer);
  assert.equal(m.lotes.estado('pl:1').aCorrer, false);
  assert.ok(!m.registo.some((r) => r.startsWith('pedir')), 'nada se descarregou');
  // E a fila continua viva para a lista seguinte.
  m.mudarRede({ dadosMoveis: false });
  m.lotes.juntar('pl:2', [{ id: 'x' }]);
  await ate(() => m.disco.has('x'));
  assert.ok(m.disco.has('x'));
});

await caso('cancelar pára já: a do meio perde o pedido, as feitas ficam', async () => {
  const m = montar();
  m.lotes.juntar('pl:1', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  await ate(() => m.disco.has('a'));
  m.segurarPedidos(true);
  await ate(() => m.registo.includes('pedir b'));
  await m.lotes.cancelar('pl:1');
  m.largar();
  await ate(() => !m.lotes.estado('pl:1').aCorrer);
  await m.vazia();
  assert.ok(m.registo.includes('tirar b'), 'a música a meio sai');
  assert.ok(!m.registo.includes('pedir c'), 'a seguinte não começa');
  assert.ok(m.disco.has('a'), 'a que já estava fica');
});

await caso(`${FALHAS_SEGUIDAS_PARA_PARAR} falhas seguidas param o lote, e dizem-no`, async () => {
  const m = montar();
  const faixas: F[] = Array.from({ length: 10 }, (_, i) => ({ id: `f${i}`, falha: true }));
  m.lotes.juntar('pl:1', faixas);
  await ate(() => !m.lotes.estado('pl:1').aCorrer);
  assert.equal(m.registo.filter((r) => r.startsWith('pedir')).length, FALHAS_SEGUIDAS_PARA_PARAR);
  assert.equal(m.lotes.estado('pl:1').parouPorFalhas, true);
  m.lotes.juntar('pl:1', []);
  assert.equal(m.lotes.estado('pl:1').parouPorFalhas, false, 'pedir outra vez apaga o aviso');
});

await caso('uma falha no meio de sucessos não para', async () => {
  const m = montar();
  m.lotes.juntar('pl:1', [{ id: 'a' }, { id: 'b', falha: true }, { id: 'c' }]);
  await ate(() => !m.lotes.estado('pl:1').aCorrer);
  assert.ok(m.disco.has('a') && m.disco.has('c'));
  assert.equal(m.lotes.estado('pl:1').parouPorFalhas, false);
});

await caso('as listas fazem fila, e pedir a mesma outra vez não a duplica', async () => {
  const m = montar();
  m.segurarPedidos(true);
  m.lotes.juntar('pl:1', [{ id: 'a' }]);
  m.lotes.juntar('pl:2', [{ id: 'x' }]);
  m.lotes.juntar('pl:1', [{ id: 'a' }]);
  await ate(() => m.registo.includes('pedir a'));
  assert.ok(m.lotes.estado('pl:2').aCorrer, 'a segunda espera na fila');
  m.segurarPedidos(false);
  m.largar();
  await ate(() => !m.lotes.estado('pl:2').aCorrer);
  assert.deepEqual(m.registo.filter((r) => r.startsWith('pedir')), ['pedir a', 'pedir x']);
});

// --- O menu da playlist -----------------------------------------------------

const base = { plataforma: 'ios' as const, onde: 'pagina' as const, temFaixas: true, minha: true };
const ids = (s: Parameters<typeof menuDaPlaylist>[0]) => menuDaPlaylist(s).map((a) => a.id);

await caso('o menu: sem estado de download, nada muda', () => {
  assert.ok(!ids(base).some((i) => i.includes('download') || i === 'descarregar'));
});

await caso('o menu: cada estado tem a sua ação, primeiro que tudo', () => {
  assert.deepEqual(ids({ ...base, download: 'nenhum' }).slice(0, 1), ['descarregar']);
  assert.deepEqual(ids({ ...base, download: 'parcial' }).slice(0, 2), ['descarregar', 'tirar-downloads']);
  assert.deepEqual(ids({ ...base, download: 'a-descarregar' }).slice(0, 1), ['cancelar-download']);
  assert.deepEqual(ids({ ...base, download: 'completo' }).slice(0, 1), ['tirar-downloads']);
  const rotulos = (d: any) => menuDaPlaylist({ ...base, download: d }).map((a) => a.rotulo);
  assert.equal(rotulos('nenhum')[0], 'Download');
  assert.equal(rotulos('parcial')[0], 'Download the rest');
  assert.equal(rotulos('a-descarregar')[0], 'Cancel download');
  assert.equal(rotulos('completo')[0], 'Remove download');
  assert.equal(menuDaPlaylist({ ...base, download: 'nenhum' }).find((a) => a.id === 'partilhar')?.inicioDeGrupo, true, 'a partilha abre bloco novo');
});

await caso('o menu: só no iPhone, dentro da playlist, com músicas', () => {
  assert.ok(!ids({ ...base, plataforma: 'pc', download: 'nenhum' }).includes('descarregar'));
  assert.ok(!ids({ ...base, onde: 'cartao', download: 'nenhum' }).includes('descarregar'));
  assert.ok(!ids({ ...base, temFaixas: false, download: 'nenhum' }).includes('descarregar'));
  assert.ok(ids({ ...base, minha: false, download: 'nenhum' }).includes('descarregar'), 'uma playlist de outra pessoa também se descarrega');
});

// --- A ligação na página e no PC --------------------------------------------

await caso('a página liga as três ações e a linha de progresso', () => {
  const pagina = readFileSync(new URL('../src/screens/PlaylistDetailScreen.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(pagina, /a\.id === 'descarregar'\) pedirDownloadDaLista\(\)/);
  assert.match(pagina, /a\.id === 'cancelar-download'\) void cancelarDownloadDaLista\(chaveDoDownload\)/);
  assert.match(pagina, /a\.id === 'tirar-downloads'\) setTirarDownloadsAberto\(true\)/);
  assert.match(pagina, /usarDadosMoveisNaLista\(chaveDoDownload\)/);
  assert.match(pagina, /download: descarregaveis\.length \? downloadDaPlaylist : undefined/);
});

await caso('o PC tem os mesmos nomes e não faz nada', () => {
  const web = readFileSync(new URL('../src/lib/descarregarFaixa.web.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const nome of ['descarregarLista', 'cancelarDownloadDaLista', 'usarDadosMoveisNaLista', 'tirarDownloadsDaLista', 'useDownloadDaLista']) {
    assert.match(web, new RegExp(`export (async )?function ${nome}\\b`), nome);
  }
});

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntest-download-da-lista: tudo certo');
