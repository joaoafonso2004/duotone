// O detetor de batidas do glitch do PC (`src/desktop/glitch/beat.web.ts`).
//
// O que este teste prende é UMA coisa: a deteção tem relógio próprio e não
// depende do laço de desenho. Repare-se que aqui nunca se chama `nivel()` --
// a cadeia visual, a que vem com os quadros -- e mesmo assim todas as batidas
// têm de aparecer. Se alguém voltar a pôr a deteção dentro do desenho, este
// teste fica a zero.
//
// Foi exatamente isso que aconteceu em `fd99a32` (4/9/2026): o laço passou a
// 30 fps para a app aquecer menos e o `return` do estrangulamento ficou ANTES
// do `nivel()`, que na altura fazia as duas coisas. A janela do analisador são
// 21 ms e as leituras passaram a 33 ms de distância: 36% do som deixou de ser
// olhado. Em andamentos rápidos perdiam-se batidas, e não havia teste nenhum a
// dizê-lo -- o efeito continuava a "funcionar".
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

const TAXA = 48000;

/** Um gerador com semente: o teste não pode passar ou falhar à sorte. */
function aleatorio(semente) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Som já depois do passa-banda dos 100-200 Hz, que é o que a cadeia de deteção
 * vê: cada bombo é um seno de 150 Hz a decair. `tau` curto de propósito -- é o
 * bombo seco dos géneros rápidos que mais vezes caía no buraco.
 */
function faixa(bpm, segundos, { tau = 0.022, ganho = 1, semente = 7 } = {}) {
  const rnd = aleatorio(semente);
  const n = Math.ceil(TAXA * segundos);
  const som = new Float32Array(n);
  const passo = (60 / bpm) * TAXA;
  const batidas = [];
  for (let k = 0; Math.round(k * passo) < n; k++) {
    const i0 = Math.round(k * passo);
    batidas.push((i0 / TAXA) * 1000);
    for (let i = 0; i < TAXA * 0.25 && i0 + i < n; i++) {
      som[i0 + i] += Math.sin((2 * Math.PI * 150 * i) / TAXA) * Math.exp(-i / TAXA / tau) * 0.9;
    }
  }
  for (let i = 0; i < n; i++) som[i] = (som[i] + (rnd() * 2 - 1) * 0.004) * ganho;
  return { som, batidas };
}

/**
 * Um mundo de browser só com o que o `beat.web.ts` toca, e com o tempo na
 * nossa mão: nada aqui anda sozinho, tudo anda porque o teste manda.
 */
function montarMundo(som) {
  let agora = 0;
  const temporizadores = new Map();
  let proximoId = 1;

  const analisador = () => ({
    fftSize: 2048,
    smoothingTimeConstant: 0,
    connect() {},
    getFloatTimeDomainData(buf) {
      // As últimas `fftSize` amostras até ao instante atual, como o AnalyserNode.
      const fim = Math.min(som.length, Math.round((agora / 1000) * TAXA));
      for (let i = 0; i < buf.length; i++) {
        const j = fim - buf.length + i;
        buf[i] = j >= 0 ? som[j] : 0;
      }
    },
    getByteFrequencyData(buf) { buf.fill(0); },
  });

  const pista = { addEventListener() {}, stop() {} };
  const fluxo = {
    getVideoTracks: () => [],
    getAudioTracks: () => [pista],
    getTracks: () => [pista],
    removeTrack() {},
  };

  const caixa = {
    console,
    performance: { now: () => agora },
    navigator: { mediaDevices: { getDisplayMedia: async () => fluxo } },
    window: { addEventListener() {}, removeEventListener() {} },
    AudioContext: class {
      constructor() { this.sampleRate = TAXA; }
      createMediaStreamSource() { return { connect() {} }; }
      createAnalyser() { return analisador(); }
      createBiquadFilter() { return { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect() {} }; }
      async suspend() {} async resume() {} async close() {}
    },
    setInterval(fn, ms) {
      const id = proximoId++;
      temporizadores.set(id, { fn, ms, proximo: agora + ms });
      return id;
    },
    clearInterval(id) { temporizadores.delete(id); },
  };
  vm.createContext(caixa);

  /** Anda `ms` no relógio, disparando o que estiver marcado pelo caminho. */
  const andar = (ms, aCadaMs) => {
    const fim = agora + ms;
    while (agora < fim) {
      agora = Math.min(fim, agora + 1);
      for (const t of temporizadores.values()) {
        while (t.proximo <= agora) { t.proximo += t.ms; t.fn(); }
      }
      aCadaMs?.(agora);
    }
  };

  return { caixa, andar, quandoEstamos: () => agora, quantosRelogios: () => temporizadores.size };
}

function carregar(ficheiro, duplos, caixa) {
  const codigo = ts.transpileModule(fs.readFileSync(path.join(root, ficheiro), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInContext(`(function(require,module,exports){${codigo}\n})`, caixa, { filename: ficheiro })(
    (nome) => {
      if (!(nome in duplos)) throw new Error('Falta o duplo: ' + nome);
      return duplos[nome];
    },
    mod, mod.exports,
  );
  return mod.exports;
}

const vazio = () => new Promise((r) => setImmediate(r));

/** Corre uma faixa inteira e devolve os instantes em que a pancada acendeu. */
async function correr(bpm, opcoes = {}) {
  const segundos = opcoes.segundos ?? 12;
  const { som, batidas } = faixa(bpm, segundos, opcoes);
  const mundo = montarMundo(som);
  const { iniciarCaptura } = carregar('src/desktop/glitch/beat.web.ts', {
    '../../lib/compasso': { andamentoDosAtaques: () => null },
  }, mundo.caixa);

  const captura = iniciarCaptura();
  await vazio(); await vazio(); // o getDisplayMedia resolve-se numa microtarefa
  assert.equal(captura.estado(), 'ativa', 'a captura montou');
  assert.equal(mundo.quantosRelogios(), 1, 'o detetor tem relógio próprio, e um só');

  // De propósito: NUNCA se chama nivel(). A deteção não pode depender dela.
  const acendeu = [];
  let anterior = 0;
  mundo.andar(segundos * 1000, (t) => {
    const agora = captura.batida(t);
    if (agora > anterior + 1e-9) acendeu.push(t);
    anterior = agora;
  });
  captura.parar();
  assert.equal(mundo.quantosRelogios(), 0, 'parar() também desliga o relógio do detetor');
  return { batidas, acendeu };
}

/** Casa cada bombo com a primeira pancada que acenda à volta dele. */
function pontuar(batidas, acendeu, desde = 600) {
  const reais = batidas.filter((b) => b >= desde);
  const atrasos = [];
  for (const b of reais) {
    const t = acendeu.find((x) => x >= b - 2 && x <= b + 45);
    if (t !== undefined) atrasos.push(t - b);
  }
  return {
    total: reais.length,
    apanhadas: atrasos.length,
    pct: (100 * atrasos.length) / reais.length,
    atrasoMaximo: atrasos.length ? Math.max(...atrasos) : Infinity,
    atrasoMedio: atrasos.reduce((s, d) => s + d, 0) / (atrasos.length || 1),
    acendimentos: acendeu.filter((x) => x >= desde).length,
  };
}

async function run() {
  // --- Nenhum andamento perde batidas -------------------------------------
  // Os rápidos são os que importam: era aí que o buraco de 12 ms mordia. A
  // 190 BPM com o detetor no laço de desenho isto andava pelos 88-95%.
  for (const bpm of [90, 120, 150, 175, 190]) {
    const { batidas, acendeu } = await correr(bpm);
    const p = pontuar(batidas, acendeu);
    assert.ok(p.total >= 15, `${bpm} BPM: a faixa tem bombos que cheguem (${p.total})`);
    assert.equal(p.apanhadas, p.total,
      `a ${bpm} BPM apanharam-se ${p.apanhadas} de ${p.total} bombos (${p.pct.toFixed(0)}%)`);
    // Cair NA batida: o relógio é de 5 ms, por isso a pancada nunca pode
    // chegar com o atraso de um quadro. Era o "não faz no beat".
    assert.ok(p.atrasoMaximo <= 12,
      `a ${bpm} BPM a pancada chegou ${p.atrasoMaximo.toFixed(0)} ms depois do bombo`);
    // E não pode acender entre batidas: o tremor constante foi afinado para
    // fora, e mais sensibilidade não pode trazê-lo de volta.
    assert.ok(p.acendimentos <= p.total * 1.1,
      `a ${bpm} BPM acendeu ${p.acendimentos} vezes para ${p.total} bombos`);
  }

  // --- Uma faixa baixa não é uma faixa sem batidas -------------------------
  // O limiar é adaptativo ao volume da faixa; -12 dB não pode mudar nada.
  for (const bpm of [120, 190]) {
    const { batidas, acendeu } = await correr(bpm, { ganho: 0.25, semente: 23 });
    const p = pontuar(batidas, acendeu);
    assert.equal(p.apanhadas, p.total,
      `a ${bpm} BPM e -12 dB apanharam-se ${p.apanhadas} de ${p.total}`);
  }

  // --- Um bombo mais gordo também ------------------------------------------
  const { batidas, acendeu } = await correr(128, { tau: 0.055, semente: 99 });
  const gordo = pontuar(batidas, acendeu);
  assert.equal(gordo.apanhadas, gordo.total,
    `com o bombo largo apanharam-se ${gordo.apanhadas} de ${gordo.total}`);

  // --- O silêncio é silêncio ------------------------------------------------
  const mudo = await correr(120, { ganho: 0, segundos: 6 });
  assert.equal(mudo.acendeu.length, 0, 'sem som não acende nada');

  // --- Uma captura para a app inteira (11/11) ------------------------------
  // O efeito parava até a um clique: cada música pedia outra captura, e o
  // getDisplayMedia sem um gesto falha. Agora passa de uma capa para a outra.
  {
    const { som } = faixa(120, 4);
    const mundo = montarMundo(som);
    let pedidos = 0;
    const pedirOriginal = mundo.caixa.navigator.mediaDevices.getDisplayMedia;
    mundo.caixa.navigator.mediaDevices.getDisplayMedia = async (...args) => { pedidos++; return pedirOriginal(...args); };
    const adeus = new Map();
    let proximo = 1;
    mundo.caixa.setTimeout = (fn) => { const id = proximo++; adeus.set(id, fn); return id; };
    mundo.caixa.clearTimeout = (id) => { adeus.delete(id); };
    const { pedirCaptura, largarCaptura } = carregar('src/desktop/glitch/beat.web.ts', {
      '../../lib/compasso': { andamentoDosAtaques: () => null },
    }, mundo.caixa);

    const a = pedirCaptura();
    await vazio(); await vazio();
    assert.equal(a.estado(), 'ativa', 'a primeira capa monta a captura');
    mundo.andar(3000);
    let acendeu = false;
    mundo.andar(1000, (t) => { if (a.batida(t) > 0) acendeu = true; });
    assert.ok(acendeu, 'a captura ouve as batidas');

    // A música acaba e a capa seguinte monta-se: a mesma captura, sem pedir outra.
    largarCaptura(a);
    const b = pedirCaptura();
    assert.equal(b, a, 'a capa da música seguinte recebe a mesma captura');
    assert.equal(pedidos, 1, 'sem um getDisplayMedia novo (sem um gesto, falhava)');
    assert.equal(b.batida(mundo.quandoEstamos()), 0, 'mas a batida da música anterior esquece-se');
    assert.equal(adeus.size, 0, 'a folga para parar foi desmarcada');

    // Largada por todos: suspende-se, e depois da folga pára de vez.
    largarCaptura(b);
    assert.equal(mundo.quantosRelogios(), 0, 'suspensa, o relógio do detetor pára');
    assert.equal(adeus.size, 1, 'marca-se a paragem');
    for (const fn of [...adeus.values()]) fn();
    assert.equal(b.terminou(), true, 'depois da folga, parou');
    const c = pedirCaptura();
    await vazio(); await vazio();
    assert.notEqual(c, a, 'uma nova, depois de parada');
    assert.equal(pedidos, 2);
    largarCaptura(c);
    for (const fn of [...adeus.values()]) fn();
  }

  console.log('Batida do glitch: relógio próprio, nenhum bombo perdido de 90 a 190 BPM, e quieto em silêncio.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
