// Executa a página real com uma fronteira visual substituída. Mantém a identidade
// dos hooks entre renders, incluindo efeitos e limpezas; o layout é verificado no browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const ficheiro = path.join(root, 'src/desktop/paginas/NowPlayingPage.web.tsx');
const codigo = ts.transpileModule(fs.readFileSync(ficheiro, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const noop = () => {};
const faixa = id => ({ source: 'youtube', sourceId: id, title: id, artist: 'Duotone', artworkUrl: null });
const nos = n => Array.isArray(n) ? n.flatMap(nos) : !n || typeof n !== 'object' ? [] : [n, ...nos(n.props?.children)];
const encontrar = (arvore, tipo, condicao = () => true) => nos(arvore).find(n => n.type === tipo && condicao(n.props));

function ensaiar(inicial) {
  const estado = { current: inicial, eqGanhos: [0, 0, 0], ajustesPorFaixa: {}, playbackRate: 1, doRadio: [], sugeridas: [] };
  const slots = [], ouvintes = new Map();
  let cursor = 0, assinatura, tipos, efeitos, mudou;
  function slot(tipo, inicializar) {
    tipos.push(tipo);
    const i = cursor++;
    return slots[i] ??= inicializar();
  }
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(inicializar) {
      const s = slot('state', () => ({ valor: typeof inicializar === 'function' ? inicializar() : inicializar }));
      return [s.valor, v => {
        const seguinte = typeof v === 'function' ? v(s.valor) : v;
        if (!Object.is(s.valor, seguinte)) { s.valor = seguinte; mudou = true; }
      }];
    },
    useRef: current => slot('ref', () => ({ current })),
    useMemo(fn) { slot('memo', () => ({})); return fn(); },
    useEffect(fn, deps) {
      const s = slot('effect', () => ({}));
      if (!s.deps || !deps || deps.some((d, i) => !Object.is(d, s.deps[i]))) {
        efeitos.push(() => { s.limpar?.(); s.deps = deps; s.limpar = fn(); });
      }
    },
  };
  const duplos = {
    react: React, 'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView' },
    '@expo/vector-icons/Ionicons': 'Icon',
    '../FilaDoLeitor.web': { AbasDoCartao: 'Abas', CabecaDaFila: 'Cabeca', LinhasDaFila: 'Linhas' },
    '../SobreAMusica.web': { SobreAMusica: 'Sobre' }, '../../components/LyricsView': { LyricsView: 'Letras' },
    '../useFilaDoLeitor.web': { useFilaDoLeitor: () => ({ current: estado.current, upNext: [], emJam: false }) },
    '../../components/ArtworkLyricsCube': { ArtworkLyricsCube: 'Cubo' },
    '../../lib/prefs': { getGlitchMode: async () => 'off', getEffectIntensity: async () => 'normal' },
    '../../state/player': { usePlayer: Object.assign(sel => sel(estado), { getState: () => estado }), ganhosEmVigor: s => s.eqDaEscuta ?? s.eqGanhos },
    '../../lib/origemDaFila': { rotuloDaOrigem: () => null },
    '../../lib/shuffle': { trackKey: t => t.sourceId }, '../../lib/equalizer': { chaveDaFaixa: t => t.sourceId },
    '../PainelEqualizador.web': { PainelEqualizador: 'Equalizador' }, '../glitch/GlitchArtwork.web': { GlitchArtwork: 'Glitch' },
    '../estilos.web': { styles: {} }, '../tokens.web': { COR: {}, ESP: {}, ESTADO: {}, TIPO: {} },
    '../ui.web': { BotaoVoltar: 'Voltar', Artwork: 'Artwork', Dialog: 'Dialog', Empty: 'Empty', IconButton: 'IconButton', marcar: () => ({}), Page: 'Page', ui: {} },
    '../FundoDaCapa.web': { FundoDaCapa: 'Fundo' },
    '../useCapaGrande.web': { useCapaGrande: () => null, preCarregarCapaGrande: noop },
    '../Ocultacao.web': { useCapaQueSai: () => null }, '../DuasLuas.web': { DuasLuas: 'Luas' },
    '../../state/passagemAVista': { luasNoEcra: () => false }, '../../lib/ocultacao': {},
    '../../lib/leitorDoPc': { disposicaoDoLeitor: () => ({ duasColunas: true, lado: 480 }) },
    '../../components/CoracaoAnimado': { CoracaoAnimado: 'Coracao' },
    '../../hooks/useCoracaoAoCarregar': { useCoracaoAoCarregar: () => ({}) },
    '../../lib/artistName': { displayArtist: t => t.artist, tituloDaFaixa: t => t.title },
    '../../state/catalogoDeFaixas': { useCatalogoDeFaixas: sel => sel({ versao: 0 }), comCatalogo: t => t, garantirCatalogo: noop },
    '../../lib/frasesDosEstados': { FRASES_DOS_ESTADOS: { nadaATocar: { titulo: 'Nothing playing', corpo: 'Choose a song' } } },
  };
  const module = { exports: {} };
  vm.runInNewContext(codigo, { module, exports: module.exports, require: nome => {
    assert.ok(nome in duplos, `Import sem duplo: ${nome}`); return duplos[nome];
  }, window: {
    addEventListener: (nome, fn) => { if (!ouvintes.has(nome)) ouvintes.set(nome, new Set()); ouvintes.get(nome).add(fn); },
    removeEventListener: (nome, fn) => ouvintes.get(nome)?.delete(fn),
  } });
  let voltas = 0;
  const props = { back: () => voltas++, more: noop, notify: noop, currentIsSaved: false, toggleSaveCurrent: noop, navigate: noop, aoAdicionarAPlaylist: noop, share: noop };
  function render() {
    let arvore;
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      cursor = 0; tipos = []; efeitos = []; mudou = false;
      arvore = module.exports.NowPlayingPage(props);
      assinatura ??= tipos;
      assert.deepEqual(tipos, assinatura, 'fechar/reabrir não pode mudar a ordem nem o número de hooks');
      efeitos.forEach(fn => fn());
      if (!mudou) return arvore;
    }
    assert.fail('render não estabilizou');
  }
  const vazia = arvore => {
    assert.equal(arvore.type, 'Page');
    assert.equal(encontrar(arvore, 'Empty').props.title, 'Nothing playing');
    arvore.props.action.props.onPress();
    assert.ok(voltas > 0, 'o voltar continua disponível depois de fechar');
    assert.equal(ouvintes.get('keydown')?.size ?? 0, 0, 'sem música não fica um Escape da letra expandida');
  };
  let arvore = render();
  if (!inicial) vazia(arvore);
  for (let i = 0; i < 3; i++) {
    estado.current = faixa(`musica-${i}`);
    arvore = render();
    assert.ok(encontrar(arvore, 'Cubo'), 'reabrir mostra a música');
    estado.current = faixa(`seguinte-${i}`);
    arvore = render();
    assert.equal(encontrar(arvore, 'Cubo').props.track.sourceId, `seguinte-${i}`, 'skip mantém a página funcional');
    // Reproduz o fecho tanto com a fila aberta como com a letra expandida.
    const abas = encontrar(arvore, 'Cabeca')?.props.abas;
    (abas?.aoMudar ?? encontrar(arvore, 'Abas').props.aoMudar)(i === 1 ? 'fila' : 'letra');
    arvore = render();
    if (i !== 1) {
      encontrar(arvore, 'Pressable', p => p.accessibilityLabel === 'Expand the lyrics').props.onPress();
      arvore = render();
      assert.equal(encontrar(arvore, 'Letras').props.escala, 1.5);
      assert.equal(ouvintes.get('keydown').size, 1);
    }
    estado.current = null;
    vazia(render());
  }
}
ensaiar(faixa('inicial'));
ensaiar(null);
console.log('Now Playing: fechar, reabrir, skip e fechar com a letra expandida mantêm os hooks e limpam o Escape.');
