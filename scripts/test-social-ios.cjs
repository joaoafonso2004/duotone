// O Social do iPhone (9/10, docs/PLANO-SOCIAL-IOS.md): a lista nova e a fila "Listening now".
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: file })(id => {
    assert.ok(id in mocks, `Unexpected import ${id}`); return mocks[id];
  }, module, module.exports);
  return module.exports;
}
let hook = 0; const state = [];
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useMemo: fn => fn(), useState: initial => { const i = hook++; if (!(i in state)) state[i] = initial; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; } };
const OuvirAgora = () => null;
const { SocialOverview } = load('src/components/SocialOverview.tsx', {
  react: React, 'react-native': { Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: x => x } },
  'expo-image': { Image: 'Image' }, '@expo/vector-icons/Ionicons': 'Icon',
  '../lib/previaDaConversa': load('src/lib/previaDaConversa.ts'),
  '../lib/socialPresence': { ultimaAtividade: () => '2d ago' }, '../lib/social': { haQuantoTempo: () => 'now' },
  '../lib/ordemDasConversas': load('src/lib/ordemDasConversas.ts'),
  '../lib/artistName': { tituloDaFaixa: t => t.title.replace(/^.* - /, ''), displayArtist: t => t.artist },
  '../lib/capaDoEcraBloqueado': { capaParaLista: x => x }, '../lib/corDaCapa': { textoSobre: () => '#111' },
  '../state/theme': { useTheme: sel => sel({ theme: { color: '#C9A86A', soft: 'soft' } }) },
  './socialTokens': { colors: {} }, '../theme': { ESCALA_MAXIMA: { lista: 1.4 } },
  './FriendAvatar': { FriendAvatar: 'FriendAvatar' }, './GroupChat': { GroupAvatar: 'GroupAvatar' }, './OuvirAgora': { OuvirAgora },
});
const now = Date.parse('2026-10-09T11:00:00Z');
const track = { source: 'youtube', sourceId: 'a', title: 'DDG - Elon Musk', artist: 'DDG', artworkUrl: 'cover', album: null, durationSeconds: 180 };
const amigo = (id, extra = {}) => ({ friendId: id, name: id, username: id, avatarUrl: null, status: 'accepted', online: false, lastSeenAt: null, musicActivity: null, ...extra });
const opened = [], menus = [];
const props = {
  friends: [amigo('nuno', { online: true, musicActivity: { track, at: new Date(now).toISOString(), listening: true } }), amigo('zyn'), amigo('miguel')],
  groups: [], contacts: [],
  previews: {
    nuno: { createdAt: new Date(now - 1000).toISOString(), senderId: 'eu', itemType: 'sessao', message: null, trackTitle: null, trackArtist: null },
    zyn: { createdAt: new Date(now - 9e6).toISOString(), senderId: 'zyn', itemType: 'track', message: null, trackTitle: 'DDG - Elon Musk', trackArtist: 'DDG', trackArtwork: 'cover' },
  },
  activity: { nuno: now - 1000, zyn: now - 9e6 }, unread: new Map([['zyn', 2]]), now, myId: 'eu', loading: false,
  requests: { type: 'Pedidos', props: { children: [] } }, pedidos: 2, gutter: 24,
  onOpen: (...a) => opened.push(a), onProfile() {}, onTrack() {}, onRemoveFriend() {},
  onFriendMenu: (id) => menus.push(id), onDeleteConversation() {}, onStart() {},
};
const render = () => { hook = 0; return SocialOverview(props); };
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...(tree.props?.children ?? []).flat(Infinity).flatMap(nodes)]; }
function text(tree) { return (tree.props?.children ?? []).flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join(''); }
const linhas = (n) => n.filter(x => x.type === 'Pressable' && typeof x.props.accessibilityLabel === 'string' && x.props.accessibilityLabel.includes('. '));
let n = nodes(render());

assert.deepEqual(n.filter(x => x.props.accessibilityRole === 'header').map(text), ['Chats', 'Friends'],
  'conversas e, no fim, os amigos com quem nunca se falou');
assert.ok(n.some(x => x.type === OuvirAgora), 'a fila "Listening now" está no topo');
assert.equal(n.filter(x => x.type === 'ChatButton').length, 0, 'sem botão de conversa repetido em cada linha');
const rows = linhas(n);
assert.deepEqual(rows.map(r => r.props.accessibilityLabel.split('.')[0]), ['nuno', 'zyn', 'miguel']);
assert.ok(rows[0].props.accessibilityLabel.includes('You invited nuno to a Jam'), 'a frase de quem convidou, não "You: Invited you"');
assert.ok(rows[1].props.accessibilityLabel.includes('Elon Musk · DDG'), 'a música com o título limpo');
assert.ok(rows[1].props.accessibilityLabel.endsWith('2 unread'));
assert.ok(rows[2].props.accessibilityLabel.includes('2d ago'), 'um amigo sem conversa diz o estado');
rows[1].props.onPress(); assert.deepEqual(opened.at(-1), ['friend', 'zyn'], 'a linha inteira abre a conversa');
rows[1].props.onLongPress({ nativeEvent: { pageX: 1, pageY: 2 } }); assert.equal(menus.at(-1), 'zyn', 'o toque longo abre o menu do amigo');
const anel = nodes(rows[0]).find(x => Array.isArray(x.props.style) && x.props.style.some(s => s && s.borderColor === '#C9A86A'));
assert.ok(anel, 'quem está a ouvir tem o anel na cor do tema');

const pilula = n.find(x => x.type === 'Pressable' && nodes(x).some(t => t.type === 'Text' && text(t) === '2 friend requests'));
assert.ok(pilula, 'os pedidos numa pastilha por baixo do título');
assert.ok(!n.some(x => x.type === 'Pedidos'), 'fechados de início');
pilula.props.onPress(); n = nodes(render());
assert.ok(n.some(x => x.type === 'Pedidos'), 'a pastilha mostra os pedidos');

props.procurar = true; n = nodes(render());
const campo = n.find(x => x.type === 'TextInput'); assert.ok(campo, 'a lupa mostra a pesquisa');
campo.props.onChangeText('zy'); n = nodes(render());
assert.deepEqual(linhas(n).map(r => r.props.accessibilityLabel.split('.')[0]), ['zyn']);
assert.ok(!n.some(x => x.type === OuvirAgora), 'a pesquisar, só as conversas');

// Regras de leitura de código.
const ler = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const fonte = ler('src/components/SocialOverview.tsx');
assert.doesNotMatch(fonte, /PanGestureHandler|PanResponder|Swipeable/, 'sem gestos para o lado: o Social vive no pager dos separadores');
assert.doesNotMatch(fonte, /previewText\(/, 'a pré-visualização é a previaDaConversa');
assert.doesNotMatch(ler('src/components/SocialOverview.web.tsx'), /previewText\(/, 'também no PC');
const fila = ler('src/components/OuvirAgora.tsx');
assert.match(fila, /abrirFolhaDoAmigo\(a\.friendId\)/, 'tocar num amigo abre a folha dele');
assert.match(fila, /useTheme/, 'o anel segue a cor do tema (que só segue a da capa com a opção ligada)');
assert.match(ler('src/components/AmigosAOuvir.tsx'), /amigo\.musicActivity\s*\?\s*abrirFolhaDoAmigo\(amigo\.friendId\)/,
  'na Home, um amigo a ouvir abre a mesma folha');
assert.match(ler('src/navigation/RootNavigator.tsx'), /<FolhaDoAmigo \/>/, 'a folha está montada uma vez no iPhone');
// A conversa (fase 2).
const hub = ler('src/components/SocialHub.tsx');
assert.doesNotMatch(hub, /aOuvir=\{friend\.currentlyPlaying\?\.title/, 'o cabeçalho já não recebe o título cru');
assert.match(hub, /borderWidth:destacada===m\.id\?1:0/, 'o balão só tem borda quando está destacado');
assert.match(hub, /separadorPorCima\(m,antiga/, 'a hora vai para separadores ao centro');
assert.doesNotMatch(hub, /fontSize:11,marginBottom:1,opacity:0\.7/, 'a hora já não vai dentro de cada balão');
assert.match(hub, /accessibilityLabel="Send music"/, 'o ＋ do compositor manda música');
assert.match(hub, /onDuploToque=\{\(\)=>void reagir\(m\.id,'❤️'\)\}/, 'dois toques põem ❤️');
const convite = ler('src/components/ConviteDeSessao.tsx');
assert.doesNotMatch(convite, /LISTEN TOGETHER/, 'o convite diz quem convidou e que música, sem a etiqueta em maiúsculas');
assert.match(convite, /Jam ended/, 'um convite que acabou é uma linha ao centro');
const cabecalho = ler('src/components/ChatAmigo.tsx');
assert.match(cabecalho, /Listening to \{tituloDaFaixa\(aOuvir\)\} · \{displayArtist\(aOuvir\)\}/, 'o que ele ouve, limpo');
console.log('Social do iPhone: lista nova, frases certas, anel, pedidos, pesquisa, a folha do amigo e a conversa passaram.');
