// As capas acompanham o downloader real por eventos; só rede e fronteiras de
// React/Expo são simuladas. Também executa a transição com uma imagem lenta.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function load(file, mocks, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, console, Date, ...globals,
    require: name => { if (!(name in mocks)) throw Error(`Import não simulado: ${name}`); return mocks[name]; },
  }, { filename: file });
  return module.exports;
}
const capa = load('src/lib/capaGrande.ts', {});
const lista = load('src/lib/capaDoEcraBloqueado.ts', {});
const faixa = sourceId => ({ source: 'youtube', sourceId, artworkUrl: null });
const url = (id, tamanho) => `https://i.ytimg.com/vi/${id}/${tamanho}default.jpg`;
function ambiente(downloads = []) {
  const requests = [], timers = new Map(); let next = 0, ouvirDownload;
  const state = load('src/state/capasGrandes.ts', {
    'expo-image': { Image: { prefetch: (uri, policy) => new Promise(resolve => requests.push({ uri, policy, resolve })) } },
    '../lib/capaGrande': capa,
    '../lib/capaDoEcraBloqueado': lista,
    '../lib/youtubeCache': { downloadsEmCurso: () => downloads, ouvirDownloads: fn => { ouvirDownload = fn; } },
  }, {
    setTimeout: fn => { const id = ++next; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    // O HEAD que confirma se uma capa existe (3/10): 404 só para a maxres do
    // vídeo que não a tem; o resto é uma rede que não responde.
    fetch: async (u) => { if (u === url('semmaxres', 'maxres')) return { status: 404 }; throw new Error('sem rede'); },
  });
  return { state, requests, timers, event: () => ouvirDownload(), downloads };
}
async function run() {
  {
    const h = ambiente([{ videoId: 'primeira' }]);
    h.state.acompanharDownloads();
    await flush();
    assert.deepEqual(h.requests.map(r => r.uri).sort(), ['mq', 'maxres'].map(t => url('primeira', t)).sort(),
      'subscrever já aquece downloads que estavam a decorrer, incluindo o recurso');
    assert.ok(h.requests.every(r => !/\/(hq|sd)default\.jpg$/.test(r.uri)), 'nunca uma miniatura 4:3, com barras pretas (30/9)');
    assert.ok(h.requests.every(r => r.policy === 'memory-disk'), 'a cache tem de ser a mesma do leitor');
    h.state.acompanharDownloads(); h.event(); await flush();
    assert.equal(h.requests.length, 2, 'cada bocado não duplica os pedidos em curso');
    h.downloads.push({ videoId: 'segunda' }); h.event(); await flush();
    assert.equal(h.requests.length, 4, 'o download seguinte pede as suas capas sem esperar pelo fim do áudio');
    let updates = 0;
    const stop = h.state.ouvirCapasGrandes(() => { updates++; });
    assert.equal(h.state.capaGrande(faixa('segunda')), url('segunda', 'mq'), 'antes de haver alguma pronta, a pequena -- e não a hqdefault com barras');
    h.requests.find(r => r.uri === url('segunda', 'mq')).resolve(true); await flush();
    assert.equal(h.state.capaGrande(faixa('segunda')), url('segunda', 'mq'), 'mostra a capa pronta desta faixa enquanto a grande vem');
    h.requests.find(r => r.uri === url('segunda', 'maxres')).resolve(true); await flush();
    assert.equal(h.state.capaGrande(faixa('segunda')), url('segunda', 'maxres'), 'a resolução maior substitui a mini quando chega');
    assert.ok(updates >= 2, 'o leitor é avisado quando a escolha da capa muda');
    stop();
    for (const r of h.requests) r.resolve(true); await flush();
    h.event(); await flush(); assert.equal(h.requests.length, 4);
    assert.equal(h.timers.size, 0, 'sucesso limpa todos os prazos');
  }
  {
    const h = ambiente();
    h.state.preCarregarCapasGrandes([faixa('semmaxres')]); await flush();
    h.requests.find(r => r.uri === url('semmaxres', 'mq')).resolve(true);
    h.requests.find(r => r.uri === url('semmaxres', 'maxres')).resolve(false); await flush();
    assert.equal(h.state.capaGrande(faixa('semmaxres')), url('semmaxres', 'mq'), 'sem maxres, a pequena já pedida em paralelo');
    const hq720 = `https://i.ytimg.com/vi/semmaxres/hq720.jpg`;
    const pedidoHq720 = h.requests.find(r => r.uri === hq720);
    assert.ok(pedidoHq720, 'e vai à hq720, a seguinte sem moldura');
    pedidoHq720.resolve(true); await flush();
    assert.equal(h.state.capaGrande(faixa('semmaxres')), hq720, 'que substitui a pequena quando chega');
    assert.equal(h.timers.size, 0);
  }
  {
    // 3/10: em 4G, uma falha de REDE dava a maxres como inexistente até a app
    // fechar, e o leitor ficava com a de 320x180 esticada.
    const h = ambiente();
    h.state.preCarregarCapasGrandes([faixa('semrede')]); await flush();
    for (const r of h.requests) r.resolve(false); await flush();
    assert.ok(!h.requests.some(r => r.uri.includes('hq720')), 'uma falha de rede não dá a maxres como inexistente');
    assert.equal(h.timers.size, 1, 'e marca outra tentativa');
    for (const fn of [...h.timers.values()]) fn(); await flush();
    const grandes = h.requests.filter(r => r.uri === url('semrede', 'maxres'));
    assert.equal(grandes.length, 2, 'a outra tentativa volta a pedir a grande');
    grandes[1].resolve(true); await flush();
    assert.equal(h.state.capaGrande(faixa('semrede')), url('semrede', 'maxres'), 'e quando a rede deixa, a grande aparece');
    h.state.preCarregarCapasGrandes([faixa('semrede')]); await flush();
    assert.ok(h.requests.filter(r => r.uri === url('semrede', 'mq')).length >= 2, 'uma falha temporária não bloqueia o recurso');
    for (const r of h.requests) r.resolve(true); await flush();
    assert.equal(h.timers.size, 0, 'nada fica pendurado');
  }

  // O componente verdadeiro (2/10): UMA imagem para todas as faixas. A fonte
  // muda na mesma imagem, e o expo-image mostra a anterior até a nova estar
  // pronta e cruza as duas (`transition`). Uma instância por faixa deixava a
  // face preta entre a que saía e a que entrava.
  {
    let instance, slot = 0;
    const state = initial => {
      const i = slot++; const owner = instance;
      if (!(i in owner.slots)) owner.slots[i] = initial;
      return [owner.slots[i], value => { owner.slots[i] = value; owner.dirty = true; }];
    };
    const react = { useState: state,
      createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat().filter(Boolean) }) };
    const native = { StyleSheet: { absoluteFill: {} } };
    const lib = load('src/lib/transicaoDaCapa.ts', {});
    const component = load('src/components/CapaComTransicao.tsx', {
      react, 'react-native': native, 'expo-image': { Image: 'ExpoImage' }, '../lib/transicaoDaCapa': lib,
    });
    const owner = { slots: [], dirty: false };
    const render = uri => { let tree; do { owner.dirty = false; instance = owner; slot = 0;
      tree = component.CapaComTransicao({ uri, onError() {} }); } while (owner.dirty); return tree; };
    const images = node => [node, ...(node.children ?? []).flatMap(images)].filter(n => n.type === 'ExpoImage');
    let tree = render('a');
    assert.equal(images(tree).length, 1, 'uma só imagem');
    let img = images(tree)[0];
    assert.equal(img.props.source.uri, 'a');
    assert.equal(img.props.cachePolicy, 'memory-disk', 'leitor e prefetch têm de partilhar cache');
    assert.equal(img.props.recyclingKey, undefined, 'um recyclingKey limpava a capa anterior antes de a nova chegar');
    assert.equal(img.props.transition, null, 'a primeira capa (abrir o leitor) entra sem cruzar');
    assert.equal(typeof img.props.onError, 'function');
    img.props.onDisplay();
    tree = render('b'); img = images(tree)[0];
    assert.equal(images(tree).length, 1, 'trocar de faixa não monta outra imagem');
    assert.equal(img.props.source.uri, 'b', 'a fonte muda na mesma imagem');
    // Campo a campo: o objeto vem de outro contexto do vm.
    assert.equal(img.props.transition?.duration, lib.RECUO.cruzarMs, 'e cruza no lado nativo, só quando a nova está pronta');
    assert.equal(img.props.transition?.effect, 'cross-dissolve');
  }
  const player = fs.readFileSync(path.join(root, 'src/components/PlayerRoot.tsx'), 'utf8');
  assert.doesNotMatch(player, /setArtUri/, 'a capa da faixa nova não pode depender de um efeito pós-render');
  assert.match(player, /useSyncExternalStore\(ouvirCapasGrandes/, 'o render lê a capa da faixa atual e acompanha o prefetch');
  console.log('Capas com o áudio: cache partilhada, download em curso, mini/recurso em paralelo, repetição após falha e transição lenta passaram.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
