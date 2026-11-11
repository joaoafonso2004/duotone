const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
function ambiente() {
  let agora = 10000, id = 0;
  const timers = new Map(), intervalos = new Map(), avisos = [];
  const globals = { Date: class extends Date { static now() { return agora; } },
    console: { ...console, warn: (...dados) => avisos.push(dados) }, AbortController,
    setTimeout: (fn, ms) => { const n = ++id; timers.set(n, { fn, at: agora + ms }); return n; },
    clearTimeout: n => timers.delete(n),
    setInterval: (fn, ms) => { const n = ++id; intervalos.set(n, { fn, ms }); return n; },
    clearInterval: n => intervalos.delete(n) };
  return {
    agora: () => agora,
    avisos,
    bater: ms => { for (const t of [...intervalos.values()]) if (t.ms === ms) t.fn(); },
    async avancar(ms) {
      const fim = agora + ms;
      for (;;) {
        const proximo = [...timers.entries()].filter(([, t]) => t.at <= fim).sort((a, b) => a[1].at - b[1].at)[0];
        if (!proximo) break;
        agora = proximo[1].at; timers.delete(proximo[0]); proximo[1].fn(); await flush();
      }
      agora = fim; await flush();
    },
    carregar(file, mocks = {}) {
      const module = { exports: {} };
      const codigo = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText;
      vm.runInNewContext(codigo, { ...globals, module, exports: module.exports, require: n => {
        assert.ok(n in mocks, 'Import sem duplo: ' + file + ': ' + n); return mocks[n];
      } });
      return module.exports;
    },
  };
}
function loja(inicial) {
  let s = inicial;
  const ouvintes = new Set();
  return { getState: () => s, subscribe: fn => { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    mudar: p => { const antes = s; s = { ...s, ...p }; for (const fn of [...ouvintes]) fn(s, antes); } };
}
function rede() {
  const canais = [], enviados = [];
  let ligado = true;
  const sync = topic => {
    for (const c of canais) if (c.topic === topic && c.state === 'joined') c.handlers['presence:sync']?.({});
  };
  const cliente = () => ({ realtime: { isConnected: () => ligado },
    channel(topic, options) {
      const c = { topic, options, state: 'joined', tracked: false, handlers: {},
        on(tipo, filtro, fn) { c.handlers[tipo + ':' + filtro.event] = fn; return c; },
        subscribe(fn) { c.status = fn; fn('SUBSCRIBED'); return c; },
        presenceState: () => Object.fromEntries(canais.filter(o => o.topic === topic && o.tracked && o.state === 'joined').map((o, i) => [String(i), [{}]])),
        track: async () => {
          assert.equal(options.config.presence?.enabled, true, 'o SDK exige ativar Presence mesmo sem um ouvinte on(presence)');
          c.tracked = true; sync(topic); return 'ok';
        },
        send: async p => {
          assert.equal(ligado, true, 'não deve usar o fallback HTTP quando o socket cai');
          enviados.push(p);
          for (const o of [...canais]) if (o !== c && o.topic === topic && o.state === 'joined') o.handlers['broadcast:' + p.event]?.(p);
          return 'ok';
        },
      };
      canais.push(c); return c;
    },
    removeChannel: async c => { c.state = 'closed'; c.tracked = false; sync(c.topic); },
  });
  return { cliente, canais, enviados, ligar: v => { ligado = v; } };
}
const faixa = id => ({ source: 'youtube', sourceId: id, title: id, artist: 'Duotone', artworkUrl: null, durationSeconds: 180,
  rate: 0.8, positionMs: 12345, aSeguir: [] });
const estado = (id = 'a') => ({ faixa: faixa(id), ganhos: Array(10).fill(3) });
function transporte(a, cliente) {
  return a.carregar('src/lib/escutaAoVivo.ts', {
    'expo-crypto': { randomUUID: () => String(Math.random()) }, './supabase': { supabase: cliente },
    './equalizer': { BANDAS: Array(10), GANHO_MAXIMO: 20 },
    './seguirAmigo': { proximasParaAPresenca: a => a.slice(0, 5) },
  });
}
async function main() {
  {
    const a = ambiente(), r = rede(), t = transporte(a, r.cliente());
    let som = estado(), visto, quedas = 0;
    const emissor = t.emitirEscutaAoVivo('dono', 'pc', () => som);
    for (let i = 0; i < 50; i++) emissor.mudou();
    assert.equal(r.enviados.length, 0, 'sozinho não transmite ajustes');
    const parar = t.ouvirEscutaAoVivo('dono', v => { visto = v; }, () => quedas++);
    await flush(); assert.equal(visto.faixa.rate, 0.8); assert.equal(visto.ganhos[0], 3);
    assert.ok(r.canais.every(c => c.options.config.private === true));
    const antes = r.enviados.length;
    for (let i = 0; i < 200; i++) {
      som = { ...som, ganhos: [i / 10 - 10, ...som.ganhos.slice(1)], faixa: { ...som.faixa, rate: 0.5 + i / 200 } };
      emissor.mudou(); await a.avancar(10);
    }
    await a.avancar(200);
    assert.ok(r.enviados.length - antes <= 11, '200 gestos dão no máximo cinco envios por segundo, com o último valor');
    assert.equal(visto.ganhos[0], som.ganhos[0]); assert.equal(visto.faixa.rate, som.faixa.rate);
    const receptor = r.canais[1], pacote = r.enviados.at(-1);
    receptor.handlers['broadcast:escuta']({ payload: { ...pacote.payload, seq: pacote.payload.seq - 1, estado: estado('velha') } });
    assert.equal(visto.faixa.sourceId, 'a', 'não aceita pacotes fora de ordem');
    receptor.handlers['broadcast:escuta']({ payload: { ...pacote.payload, seq: 999, estado: { ...som, ganhos: Array(10).fill(NaN) } } });
    assert.equal(visto.ganhos[0], som.ganhos[0], 'não aceita ganhos inválidos');
    const n = r.enviados.length;
    r.ligar(false); emissor.mudou(); await a.avancar(300);
    assert.equal(r.enviados.length, n, 'socket desligado não provoca POSTs alternativos');
    receptor.status('CHANNEL_ERROR'); assert.equal(quedas, 1);
    r.ligar(true); receptor.status('SUBSCRIBED'); await a.avancar(200);
    assert.equal(visto.faixa.sourceId, 'a', 'reentrada pede um retrato novo pela presença do ouvinte');
    // Um segundo aparelho parado do dono não apaga o que o PC transmite.
    const outro = t.emitirEscutaAoVivo('dono', 'iphone', () => null);
    r.canais.at(-1).handlers['presence:sync'](); await a.avancar(200);
    assert.equal(visto.faixa.sourceId, 'a');
    await outro.parar();
    som = null; emissor.mudou(); await a.avancar(200);
    assert.equal(visto, null, 'escuta privada/parada não divulga faixa ou EQ');
    parar(); const final = r.enviados.length; emissor.mudou(); await a.avancar(300);
    assert.equal(r.enviados.length, final, 'deixar de seguir desliga o fluxo');
    await emissor.parar();
  }
  {
    const a = ambiente(), publicados = [], player = loja({ current: faixa('a'), isPlaying: true,
      playbackConfirmed: false, buffering: true, error: null, playbackRate: 1, positionMs: 0, positionAt: a.agora(),
      durationMs: 180000, queue: [], shuffleOrder: [], eqGanhos: Array(10).fill(0),
      // As próximas seguem a fila: a presença só publica quando elas mudam (11/11).
      upcomingQueue: () => player.getState().queue.map(i => ({ track: { source: 'youtube', sourceId: `q${i}` } })) });
    const privacidade = loja({ privada: false, carregada: true });
    let lerDirecto, ajustes = 0, parado = false, abortado = false, pendurar = true;
    const { iniciarPresenca } = a.carregar('src/lib/presenceSync.ts', {
      'react-native': { Platform: { OS: 'ios' }, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
      './appVisibility': { appEstaVisivel: () => true }, './inatividadeDoSistema': {},
      './presencaAtiva': { contaComoAtivo: () => true }, 'expo-crypto': { randomUUID: () => 'pc' },
      './deviceIdentity': { getDeviceId: async () => 'pc' },
      './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'eu' } } } }) },
        rpc: (fn, args) => {
          if (fn !== 'publish_social_presence') return Promise.resolve({ data: [] });
          publicados.push(args);
          const preso = pendurar; pendurar = false;
          let resolver;
          const resposta = preso ? new Promise(r => { resolver = r; }) : Promise.resolve({});
          resposta.abortSignal = s => { if (preso) s.addEventListener('abort', () => { abortado = true; resolver({ error: { message: 'timeout (ensaio)' } }); }); return resposta; };
          return resposta;
        } } },
      '../state/player': { usePlayer: player, ganhosEmVigor: s => s.eqGanhos },
      '../state/privacidade': { usePrivacidade: privacidade, garantirPrivacidade: async () => {} },
      '../state/ouvirJuntos': { useOuvirJuntos: loja({ sessao: null }) },
      '../state/seguirAmigo': { ritmoDeQuemSigo: () => null, useSeguirAmigo: loja({ ritmo: null }) },
      './seguirAmigo': { proximasParaAPresenca: x => x, posicaoProjetada: s => s.positionMs },
      './escutaAoVivo': { emitirEscutaAoVivo: (_, __, ler) => { lerDirecto = ler; return { mudou() { ajustes++; }, parar: async () => { parado = true; } }; } },
    });
    const parar = iniciarPresenca('eu'); await flush(); assert.equal(publicados.length, 1);
    player.mudar({ playbackConfirmed: true, buffering: false }); await flush();
    assert.equal(abortado, true, 'o arranque não espera 15 s por uma presença vazia presa');
    assert.equal(a.avisos.length, 0, 'cancelar um envio obsoleto não gera logs de erro');
    assert.equal(publicados.at(-1).p_track.sourceId, 'a', 'som confirmado publica sem esperar pelo debounce');
    assert.equal(a.agora(), 10000);
    assert.equal(lerDirecto().faixa.sourceId, 'a');
    const n = publicados.length;
    // A fila lá ao fundo não se vê (11/11): espera pelo acerto, e sai uma vez.
    for (let i = 0; i < 20; i++) { player.mudar({ queue: [i] }); await a.avancar(100); }
    assert.equal(publicados.length, n, 'a fila lá ao fundo não publica logo');
    await a.avancar(300_000);
    assert.ok(publicados.length > n, 'alterações contínuas não adiam a publicação indefinidamente: sai no acerto');
    assert.ok(publicados.length - n <= 1, 'a fila continua agrupada');
    await a.avancar(2000);
    const antes = publicados.length;
    for (let i = 0; i < 100; i++) {
      player.mudar({ eqGanhos: Array(10).fill(i / 10), playbackRate: 0.5 + i / 100 }); await a.avancar(30);
    }
    assert.equal(publicados.length, antes, 'arrastar EQ e speed não faz HTTP por gesto');
    assert.ok(ajustes >= 100);
    await a.avancar(2000); assert.equal(publicados.length, antes, 'a velocidade também espera pelo acerto');
    await a.avancar(300_000);
    assert.equal(publicados.length, antes + 1, 'só a velocidade final fica na presença, no acerto');
    assert.equal(publicados.at(-1).p_track.rate, 1.49);
    pendurar = true;
    const antesDaFalha = publicados.length;
    // Uma pausa vê-se: publica logo. Pendurada, a falha conserva a nova tentativa.
    player.mudar({ isPlaying: false }); await a.avancar(1500); await a.avancar(15000);
    await a.avancar(15000);
    assert.equal(publicados.length, antesDaFalha + 2, 'uma falha real por timeout conserva a nova tentativa limitada');
    assert.equal(a.avisos.length, 1, 'só a falha real produz um aviso; gestos e tiques não geram logs');
    player.mudar({ isPlaying: true }); await flush();
    // Um engasgo não tira a música nem publica (11/11): eram duas por engasgo.
    const antesDoEngasgo = publicados.length;
    player.mudar({ buffering: true }); await a.avancar(2000);
    player.mudar({ buffering: false }); await a.avancar(2000);
    assert.equal(publicados.length, antesDoEngasgo, 'um engasgo não publica');
    privacidade.mudar({ privada: true }); await flush();
    assert.equal(lerDirecto(), null); assert.equal(publicados.at(-1).p_track, null);
    parar(); await flush(); assert.equal(parado, true);
    const final = publicados.length;
    player.mudar({ playbackRate: 1 }); await a.avancar(5000);
    assert.equal(publicados.length, final, 'terminar limpa os temporizadores e os ouvintes');
  }
  {
    const a = ambiente(), { createStore } = require('zustand/vanilla');
    let presenca = { currently_playing: { ...faixa('a'), updatedAt: new Date(a.agora()).toISOString() }, playing_until: new Date(300000).toISOString() };
    let receber, avisarPresenca, leituras = 0, desligados = 0, guardaSeguindo, concluirPlay;
    const player = createStore(() => ({ current: faixa('a'), isPlaying: true, buffering: false, playbackConfirmed: true,
      playbackRate: 1.1, eqGanhos: Array(10).fill(2), eqDaEscuta: null, positionMs: 12345, positionAt: a.agora(),
      _aplicarEqDaEscuta: g => {
        if (JSON.stringify(g) !== JSON.stringify(player.getState().eqDaEscuta)) player.setState({ eqDaEscuta: g });
      },
      playTrack: t => new Promise(resolve => { concluirPlay = () => { player.setState({ current: t }); resolve(); }; }),
      seekTo: async ms => { player.setState({ positionMs: ms, positionAt: a.agora() }); },
      _forcarReproducao: async v => { player.setState({ isPlaying: v }); },
    }));
    const jam = createStore(() => ({ sessao: null }));
    const puros = a.carregar('src/lib/seguirAmigo.ts');
    const { useSeguirAmigo: seguir } = a.carregar('src/state/seguirAmigo.ts', {
      zustand: { create: () => fn => createStore(fn) },
      '../lib/posicaoDoAmigo': a.carregar('src/lib/posicaoDoAmigo.ts'), '../lib/seguirAmigo': puros,
      '../lib/relogioPartilhado': { agoraNoServidor: (_, em) => em },
      '../api/ouvirJuntos': { relogioActualizado: async () => null },
      './player': { usePlayer: player, registarSeguirAmigo: fn => { guardaSeguindo = fn; } },
      './social': { agoraNoServidor: a.agora, presencaDe: () => presenca,
        ouvirPresencas: fn => { avisarPresenca = fn; return () => {}; }, relerPresencas: async () => { leituras++; } },
      './ouvirJuntos': { useOuvirJuntos: jam }, '../lib/descarregarFaixa': { guardarEmSegundoPlano: async () => 0 },
      '../lib/escutaAoVivo': { ouvirEscutaAoVivo: (_, fn) => { receber = fn; return () => { desligados++; }; } },
    });
    seguir.getState().iniciar('amigo', 'Amigo'); await flush();
    assert.equal(guardaSeguindo(), true); assert.equal(seguir.getState().ritmo, 0.8);
    assert.equal(leituras, 0, 'o canal aproveita a presença já lida');
    receber({ ...estado(), faixa: { ...faixa('a'), rate: 1.4 } });
    assert.equal(seguir.getState().ritmo, 1.4, 'o speed muda na receção, sem esperar pelo tique');
    assert.equal(player.getState().eqDaEscuta[0], 3, 'a curva entra na store real da escuta');
    assert.equal(player.getState().eqGanhos[0], 2); assert.equal(player.getState().playbackRate, 1.1);
    await a.avancar(6000); a.bater(1000); await flush();
    assert.equal(seguir.getState().ritmo, 1.4, 'a presença antiga não desfaz o speed recebido em direto');
    presenca = { currently_playing: { ...faixa('b'), updatedAt: new Date(a.agora()).toISOString() }, playing_until: new Date(300000).toISOString() };
    avisarPresenca({ user_id: 'amigo' }); await flush();
    assert.ok(concluirPlay, 'mudar de música continua a seguir a presença');
    receber({ ...estado('b'), ganhos: Array(10).fill(-5), faixa: { ...faixa('b'), rate: 0.6 } });
    assert.equal(player.getState().eqDaEscuta[0], -5, 'mesmo com a faixa a carregar, os ajustes novos não ficam presos');
    assert.equal(seguir.getState().ritmo, 0.6);
    concluirPlay(); await flush();
    receber(null); await a.avancar(13000); a.bater(1000); await flush();
    assert.equal(player.getState().isPlaying, false, 'uma presença antiga não volta a tocar por cima da paragem/privacidade recebida em direto');
    seguir.getState().parar(); assert.equal(player.getState().eqDaEscuta, null);
    assert.equal(guardaSeguindo(), false); assert.equal(desligados, 1);
    receber(estado()); assert.equal(player.getState().eqDaEscuta, null, 'pacotes tardios não voltam a aplicar o EQ');
    presenca = { ...presenca, currently_playing: null };
    seguir.getState().iniciar('amigo', 'Amigo'); await flush();
    assert.equal(leituras, 1, 'carregar em ouvir com uma presença vazia verifica já a atividade');
    jam.setState({ sessao: { id: 'jam' } }); a.bater(1000);
    assert.equal(seguir.getState().seguindo, null, 'entrar num Jam termina a escuta e repõe o som');
    assert.equal(player.getState().eqDaEscuta, null);
  }
  console.log('Escuta ao vivo: arranque imediato, pedidos limitados, EQ/speed por WebSocket, privacidade, ordenação, store e limpeza passaram.');
}
main().catch(e => { console.error(e); process.exit(1); });
