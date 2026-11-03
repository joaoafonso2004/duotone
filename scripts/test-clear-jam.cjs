// API, store e controlos reais; só rede, superfícies nativas e relógios são duplos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { createStore } = require('zustand/vanilla');
const noop = () => {};
function carregar(file, mocks = {}) {
  const module = { exports: {} };
  const codigo = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(codigo, { module, exports: module.exports, require: n => {
    assert.ok(n in mocks, `${file}: import sem duplo: ${n}`); return mocks[n];
  }, setTimeout: () => 1, clearTimeout: noop, setInterval: () => 1, clearInterval: noop, Date, console });
  return module.exports;
}
const faixa = id => ({ source: 'youtube', sourceId: id, title: id, artist: 'Duotone', artworkUrl: null });
const item = id => ({ id, posicao: 1, track: faixa(id), postoPor: 'host' });
let servidor, filaNoServidor, limparRPC;
const chamadas = { clear: 0, ler: 0, radio: 0, lotes: [] };
function apagarNoServidor() {
  const ids = filaNoServidor.map(i => i.id);
  filaNoServidor = [];
  servidor = { ...servidor, radio: false, filaVersao: servidor.filaVersao + 1, filaAutomaticaPausada: true };
  return { ids, versao: servidor.filaVersao };
}
const api = {
  lerSessao: async () => { chamadas.ler++; return servidor; }, lerFila: async () => filaNoServidor,
  limparFilaDaSessao: async id => { chamadas.clear++; return limparRPC(id); },
  juntarMuitasAFila: async (id, tracks, opcoes) => { chamadas.lotes.push({ id, tracks, opcoes }); return 0; },
};
const radio = { fetchRadioTracks: async () => { chamadas.radio++; return [faixa('radio')]; } };
const { useOuvirJuntos: loja } = carregar('src/state/ouvirJuntos.ts', {
  './player': { registarOuvirJuntos: noop, usePlayer: { getState: () => ({ positionMs: 12345, upcomingQueue: () => [] }) },
    memoriaDoRadio: async () => ({ dono: 'host', jaDescobertas: new Set(), ouvidas: new Map() }), lembrarSugestoesDoRadio: async () => {} },
  zustand: { create: createStore }, 'react-native': { AppState: {} }, '../api/ouvirJuntos': api,
  '../lib/relogioPartilhado': {}, '../lib/sincronizacao': {}, '../lib/appVisibility': {}, '../lib/supabase': {},
  '../lib/deviceIdentity': { getDeviceId: async () => 'pc' },
  '../api/descoberta': { candidatasParaDescoberta: async () => [faixa('descoberta')] },
  '../lib/artistName': { chaveDeArtista: s => s.toLowerCase(), displayArtist: t => t.artist },
  '../api/radio': radio, '../lib/radio': { espalharArtistas: ts => ts },
  '../lib/jam': carregar('src/lib/jam.ts'),
  '../lib/prefs': { getJamAutoFila: async () => false, setJamAutoFila: async () => {}, getJamDesteAparelho: async () => null, setJamDesteAparelho: async () => {} },
  '../lib/shuffle': carregar('src/lib/shuffle.ts'), '../lib/eventos': { registar: noop },
});
const sessao = (o = {}) => ({ id: 'jam', hostId: 'host', convidadosControlam: false, track: faixa('atual'), aTocar: true,
  pausadaEmMs: 12345, comecouEmServidor: 1000, acabouEm: null, auxDe: null, radio: true, radioTipo: 'musica',
  filaVersao: 10, filaAutomaticaPausada: false, ...o });
function repor(o = {}, euId = 'host') {
  loja.setState({ sessao: null });
  servidor = sessao(o); filaNoServidor = [item('a'), item('b')]; limparRPC = async () => apagarNoServidor();
  chamadas.clear = chamadas.ler = chamadas.radio = 0; chamadas.lotes = [];
  loja.setState({ sessao: servidor, euId, fila: filaNoServidor, membros: [], aviso: null, autoFila: true });
}
const hook = Object.assign(select => select(loja.getState()), { getState: loja.getState, setState: loja.setState });
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: initial => [initial, noop], useEffect: noop };
const rn = { View: 'View', Text: 'Text', ScrollView: 'ScrollView', Switch: 'Switch', StyleSheet: { create: s => s } };
const nomes = { nomeDe: id => id, avatarDe: () => null, rotuloDe: id => id };
const comuns = { react: React, 'react-native': rn, '@expo/vector-icons/Ionicons': 'Icon',
  '../state/player': { usePlayer: s => s({ eqDaJamAtivo: false }) },
  '../state/ouvirJuntos': { useOuvirJuntos: hook }, '../state/social': { useSocial: sel => sel({ friends: [] }) },
  '../hooks/usePessoasDaSessao': { usePessoasDaSessao: () => nomes },
  '../lib/artistName': { displayArtist: t => t.artist, tituloDaFaixa: t => t.title },
  '../lib/sessaoViva': { presentes: ms => ms }, '../lib/jam': carregar('src/lib/jam.ts') };
const { JanelaDoJam } = carregar('src/desktop/JanelaDoJam.web.tsx', { ...comuns,
  '../components/FriendAvatar': { FriendAvatar: 'Avatar' }, './ui.web': { Button: 'Button', Dialog: 'Dialog', Artwork: 'Artwork' },
  './tokens.web': { COR: {}, ESP: {}, FONT: {}, RAIO: {}, TIPO: {} },
  '../components/MenuDoAmigoNoPc': { useMenuDoAmigoNoPc: () => ({ abrirMenuDoAmigo: noop, menuDoAmigo: null }) },
  '../lib/avisoDeRemocao': { avisarErro: noop },
});
const { FolhaDaSessao } = carregar('src/components/FolhaDaSessao.tsx', { ...comuns,
  'expo-image': { Image: 'Image' }, './BottomSheet': { BottomSheet: 'Sheet', BottomSheetScrollView: 'Scroll' },
  './FriendAvatar': { FriendAvatar: 'Avatar' }, './Toque': { Toque: 'Toque' },
  '../lib/movimento': { ESCALA: {} }, '../state/theme': { useTheme: s => s({ theme: { color: '#fff' } }) },
  '../lib/capaDoEcraBloqueado': { capaParaLista: u => u }, '../lib/haptics': { hapticSelection: noop },
  '../theme': { colors: {}, spacing: {}, radii: {}, type: {} },
});
const nos = n => Array.isArray(n) ? n.flatMap(nos) : !n || typeof n !== 'object' ? [] : [n, ...nos(n.props?.children)];
const clearNaJanela = arvore => nos(arvore).find(n => n.type === 'Button' && n.props.children.includes('Clear'));
const clearNaFolha = arvore => nos(arvore).find(n => n.props.accessibilityLabel === 'Clear the Jam queue');

async function main() {
  await Promise.resolve();
  const partilharReal=loja.getState().partilharEq, pedidosEq=[];
  const renderizadores=[() => JanelaDoJam({open:true,onClose:noop,notify:noop}),() => FolhaDaSessao({visivel:true,aoFechar:noop})];
  for(const host of [false,true])for(const controlo of [false,true]) {
    repor({convidadosControlam:controlo,eqPartilhado:false,eqDispositivo:null,eqEmissao:null},host?'host':'guest');
    loja.setState({partilharEq:async v=>{pedidosEq.push(v);}});
    for(const render of renderizadores){
      const toggle=nos(render()).find(n=>n.props.accessibilityLabel==='Share my equalizer with the Jam');
      assert.equal(!!toggle,host,'só o dono vê a opção do EQ, mesmo com controlo de convidados');
      if(toggle){toggle.props.onValueChange(true);assert.equal(pedidosEq.at(-1),true);}
    }
  }
  loja.setState({partilharEq:partilharReal});
  const rpcEq=[];
  api.partilharEqualizador=async(id,partilhar,dispositivo)=>{rpcEq.push({id,partilhar,dispositivo});return{...servidor,eqPartilhado:partilhar,eqDispositivo:dispositivo,eqEmissao:partilhar?'nova-emissao':null};};
  for(const host of [false,true])for(const controlo of [false,true]){
    repor({convidadosControlam:controlo,eqPartilhado:false,eqDispositivo:null,eqEmissao:null},host?'host':'guest');rpcEq.length=0;
    const faixa=loja.getState().sessao.track;
    await loja.getState().partilharEq(true);
    assert.equal(rpcEq.length,host?1:0,'a store também impede convidados de mudar a opção');
    if(host){assert.equal(rpcEq[0].dispositivo,'pc');assert.equal(loja.getState().sessao.eqPartilhado,true);}
    assert.equal(loja.getState().sessao.track,faixa,'confirmar o EQ não troca a faixa');
  }
  repor({eqPartilhado:false,eqDispositivo:null,eqEmissao:null});rpcEq.length=0;
  let terminarEq;
  api.partilharEqualizador=async()=>{rpcEq.push(true);return new Promise(r=>{terminarEq=r;});};
  const eqPendente=loja.getState().partilharEq(true);
  await Promise.resolve();await Promise.resolve();
  await loja.getState().partilharEq(true);
  assert.equal(rpcEq.length,1,'duplo clique não repete RPC');
  for(const render of renderizadores)assert.equal(nos(render()).find(n=>n.props.accessibilityLabel==='Share my equalizer with the Jam').props.disabled,true);
  const novaFaixa=faixa('nova-durante-rpc');
  loja.setState({sessao:{...loja.getState().sessao,track:novaFaixa}});
  terminarEq({...servidor,eqPartilhado:true,eqDispositivo:'pc',eqEmissao:'confirmada'});await eqPendente;
  assert.equal(loja.getState().sessao.track,novaFaixa,'uma resposta tardia só confirma o EQ');
  assert.equal(loja.getState().eqAAlterar,false);
  const limparReal = loja.getState().limparFila;
  const cliques = [];
  loja.setState({ limparFila: async id => { cliques.push(id); return 0; } });
  for (const anfitriao of [false, true]) for (const controlo of [false, true]) {
    repor({ convidadosControlam: controlo }, anfitriao ? 'host' : 'guest');
    for (const [render, procurar] of [
      [() => JanelaDoJam({ open: true, onClose: noop, notify: noop }), clearNaJanela],
      [() => FolhaDaSessao({ visivel: true, aoFechar: noop }), clearNaFolha],
    ]) {
      const botao = procurar(render());
      assert.equal(!!botao, anfitriao || controlo, 'as duas janelas mostram Clear apenas a quem tem controlo');
      if (botao) { botao.props.onPress(); assert.equal(cliques.at(-1), 'jam', 'o botão identifica a sala que estava aberta'); }
    }
  }
  loja.setState({ limparFila: limparReal });
  for (const anfitriao of [false, true]) for (const controlo of [false, true]) {
    repor({ convidadosControlam: controlo }, anfitriao ? 'host' : 'guest');
    const antes = loja.getState().sessao;
    const n = await loja.getState().limparFila('jam');
    assert.equal(chamadas.clear, anfitriao || controlo ? 1 : 0);
    assert.equal(n, anfitriao || controlo ? 2 : 0);
    for (const campo of ['track', 'aTocar', 'pausadaEmMs', 'comecouEmServidor']) assert.equal(loja.getState().sessao[campo], antes[campo]);
  }
  repor();
  assert.equal(await loja.getState().limparFila('outra-jam'), 0);
  assert.equal(chamadas.clear, 0, 'um botão de uma sala anterior não limpa a nova');

  // O Clear já aconteceu no servidor, mas a resposta ainda está a chegar.
  repor(); let concluir;
  limparRPC = () => { const resultado = apagarNoServidor(); return new Promise(r => { concluir = () => r(resultado); }); };
  const pendente = loja.getState().limparFila('jam');
  assert.equal(await loja.getState().limparFila('jam'), 0);
  await loja.getState().encherSeSecar();
  assert.equal(chamadas.clear, 1, 'duplo clique faz um só pedido');
  assert.equal(chamadas.radio, 0, 'não começa a encher enquanto o Clear está pendente');
  const nova = item('adicionada-depois'); filaNoServidor = [nova];
  loja.setState({ fila: [item('a'), nova] });
  concluir(); await pendente;
  assert.deepEqual(loja.getState().fila.map(i => i.id), ['adicionada-depois'], 'preserva uma adição posterior ao Clear');
  await loja.getState().encherSeSecar();
  assert.equal(chamadas.radio, 0, 'com a fila suspensa não volta a pedir sugestões');

  repor(); limparRPC = () => { const resultado = apagarNoServidor(); return new Promise(r => { concluir = () => r(resultado); }); };
  const antiga = loja.getState().limparFila('jam');
  const outraFila = [item('outra')];
  loja.setState({ sessao: sessao({ id: 'outra' }), fila: outraFila, aviso: null });
  concluir(); await antiga;
  assert.equal(loja.getState().fila, outraFila);
  assert.equal(loja.getState().aviso, null, 'uma resposta antiga não interfere na nova sala');

  repor(); limparRPC = async () => { throw Error('Servidor recusou'); };
  await assert.rejects(() => loja.getState().limparFila());
  assert.equal(loja.getState().fila.length, 2, 'uma falha não apaga a fila só na interface');
  limparRPC = async () => apagarNoServidor();
  assert.equal(await loja.getState().limparFila(), 2, 'uma falha permite tentar novamente');

  repor(); let devolverRadio;
  radio.fetchRadioTracks = () => { chamadas.radio++; return new Promise(r => { devolverRadio = r; }); };
  const enchendo = loja.getState().encherSeSecar();
  for (let i = 0; i < 10 && !devolverRadio; i++) await Promise.resolve();
  assert.ok(devolverRadio);
  await loja.getState().limparFila();
  devolverRadio([faixa('tardia')]); await enchendo;
  assert.equal(chamadas.lotes.length, 0, 'uma resposta do Radio anterior ao Clear não volta à fila');

  repor({ filaVersao: 45 }); radio.fetchRadioTracks = async () => [faixa('nova')];
  await loja.getState().encherSeSecar();
  assert.equal(chamadas.lotes[0].opcoes.versao, 45, 'o servidor recebe a revisão do início do pedido automático');
  chamadas.lotes = [];
  await loja.getState().semearFila([faixa('lista-nova')]);
  assert.equal(chamadas.lotes[0].opcoes.manual, true);
  assert.equal(chamadas.lotes[0].opcoes.versao, 45);

  // Contrato HTTP real: nomes dos RPC, parâmetros e leitura dos campos novos.
  const pedidos = [];
  const apiReal = carregar('src/api/ouvirJuntos.ts', {
    '../lib/supabase': { supabase: { rpc: async (nome, args) => {
      pedidos.push({ nome, args }); return { data: nome === 'limpar_fila_da_sessao' ? { ids: ['a'], versao: 6 } : 2, error: null };
    } } }, '../lib/relogioPartilhado': {},
  });
  assert.equal((await apiReal.limparFilaDaSessao('jam')).versao, 6);
  assert.equal(pedidos.at(-1).nome, 'limpar_fila_da_sessao');
  assert.equal(pedidos.at(-1).args.p_session, 'jam');
  await apiReal.juntarMuitasAFila('jam', [faixa('a')], { versao: 6 });
  assert.equal(pedidos.at(-1).nome, 'juntar_automaticas_a_fila');
  assert.equal(pedidos.at(-1).args.p_versao, 6);
  await apiReal.juntarMuitasAFila('jam', [faixa('a')], { versao: 6, manual: true });
  assert.equal(pedidos.at(-1).nome, 'juntar_lista_a_fila_da_sessao');
  await apiReal.juntarMuitasAFila('jam', [faixa('a')]);
  assert.equal(pedidos.at(-1).nome, 'juntar_muitas_a_fila', 'mantém a compatibilidade sem a migração');
  const convertida = apiReal.sessaoDaLinha({ id: 'jam', queue_revision: '6', queue_autofill_paused: true });
  assert.equal(convertida.filaVersao, 6); assert.equal(convertida.filaAutomaticaPausada, true);
  console.log('Clear da Jam: API, botões nas duas plataformas, permissões, duplo clique, mudanças de sala e respostas tardias passaram.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
