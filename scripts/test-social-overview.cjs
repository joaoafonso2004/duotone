const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
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
const core = load('src/lib/socialActivity.ts');
const now = Date.parse('2026-10-05T05:00:00Z');
const iso = diff => new Date(now + diff).toISOString();
const track = { source: 'youtube', sourceId: 'a', title: 'Song', artist: 'Artist', artworkUrl: 'cover', album: null, durationSeconds: 180 };
const presence = { user_id: 'friend', currently_playing: { ...track, isPlaying: true, updatedAt: iso(-60000) },
  updated_at: iso(-60000), last_seen_at: iso(-60000), online_until: null, playing_until: iso(10000) };
assert.equal(core.musicActivity(presence, now).listening, true, 'background playback is still current');
assert.equal(core.musicActivityLabel(core.musicActivity(presence, now), now), 'Listening now');
assert.equal(core.musicActivity(presence, now + 20000).listening, false, 'expired playback is recent, never green');
assert.equal(core.musicActivityLabel(core.musicActivity(presence, now + 20000), now + 20000), '1 min ago');
assert.equal(core.musicActivity({ ...presence, currently_playing: null }, now), null, 'privacy/stop clears the card');
assert.equal(core.musicActivity(presence, now + 86400001), null, 'old data does not fill the shelf');
assert.equal(core.musicActivity({ ...presence, currently_playing: { ...presence.currently_playing, updatedAt: 'bad' } }, now), null);
assert.equal(core.musicActivity({ ...presence, currently_playing: { ...presence.currently_playing, isPlaying: false } }, now).listening, false);
const message = (id, diff, sender = 'friend') => ({ id, sender: { id: sender }, createdAt: iso(diff), itemType: 'track', trackData: track, message: null });
const read = core.receivedPreviews([message('old', -20000), message('new', -10000)]);
assert.equal(read.friend.createdAt, iso(-10000));
assert.equal(core.mergePreviews(read, { friend: core.previewOf(message('stale', -30000)) }).friend.createdAt, iso(-10000));
assert.equal(core.previewText(core.previewOf(message('outgoing', 0, 'me')), 'me'), 'You: Song · Artist');
assert.equal(core.receivedPreviews([{ ...message('group', 0), groupId: 'room' }])['group:room'].trackTitle, 'Song');

let hook = 0; const state = [];
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useMemo: fn => fn(), useState: initial => { const i = hook++; if (!(i in state)) state[i] = initial; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; } };
const { SocialOverview } = load('src/components/SocialOverview.tsx', {
  react: React, 'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: x => x } },
  'expo-image': { Image: 'Image' }, '@expo/vector-icons/Ionicons': 'Icon', '../lib/socialActivity': core,
  '../lib/socialPresence': { ultimaAtividade: () => 'Last seen' }, '../lib/social': { haQuantoTempo: () => 'now' },
  '../lib/ordemDasConversas': load('src/lib/ordemDasConversas.ts'), '../lib/artistName': { tituloDaFaixa: t => t.title, displayArtist: t => t.artist },
  '../lib/capaDoEcraBloqueado': { capaParaLista: x => x }, './socialTokens': { colors: {} }, '../theme': { ESCALA_MAXIMA: { lista: 1.4 } },
  './socialUI': { AvatarDeConversa: 'Avatar', SocialIconButton: 'ChatButton' }, './GroupChat': { GroupAvatar: 'GroupAvatar' },
});
const opened = [], profiles = [], songs = [];
const friends = Array.from({ length: 7 }, (_, i) => ({ friendId: `f${i}`, name: `Friend ${i}`, avatarUrl: null,
  status: 'accepted', online: false, lastSeenAt: null, musicActivity: i < 4 ? core.musicActivity(presence, now) : null }));
const props = { friends, groups: [], contacts: [], previews: { f0: read.friend }, activity: { f0: now }, unread: new Map(),
  now, myId: 'me', loading: false, requests: null, onOpen: (...args) => opened.push(args), onProfile: id => profiles.push(id),
  onTrack: t => songs.push(t), onRemoveFriend() {}, onDeleteConversation() {}, onStart() {} };
const render = () => { hook = 0; return SocialOverview(props); };
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...(tree.props?.children ?? []).flat(Infinity).flatMap(nodes)]; }
function text(tree) { return (tree.props?.children ?? []).flat(Infinity).filter(c => typeof c === 'string').join(''); }
let tree = render(), n = nodes(tree);
const headers = n.filter(x => x.props.accessibilityRole === 'header');
assert.equal(headers.length, 2); assert.equal(headers[0].props.style, headers[1].props.style, 'identical section typography');
assert.equal(text(headers[0]), 'Music activity'); assert.equal(text(headers[1]), 'Friends');
assert.equal(headers[0].props.children.length, 1, 'no icon beside the music heading');
const shelf = n.find(x => x.type === 'ScrollView'); assert.equal(shelf.props.horizontal, true);
const cards = nodes(shelf).filter(x => x.props.accessibilityRole === 'button'); assert.equal(cards.length, 4);
tree.props.onLayout({ nativeEvent: { layout: { width: 294 } } }); tree = render(); n = nodes(tree);
const firstCard = n.find(x => x.props.accessibilityLabel?.endsWith('Song options'));
assert.ok(firstCard.props.style({ pressed: false })[1].width * 3 + 16 <= 294.1, 'three cards fit in one shelf');
firstCard.props.onPress(); assert.equal(songs[0].sourceId, 'a');
assert.equal(n.filter(x => x.type === 'ChatButton').length, 7, 'all friends appear without See all');
assert.equal(n.filter(x => x.props.accessibilityRole === 'tab').length, 0, 'one unified view');
props.activity = { f0: now - 6000, f6: now - 1000, f4: now - 3000 };
props.friends[1].online = true;
n = nodes(render());
assert.deepEqual(n.filter(x => x.type === 'ChatButton').map(x => x.props.label),
  ['Chat with Friend 6','Chat with Friend 4','Chat with Friend 0','Chat with Friend 1','Chat with Friend 2','Chat with Friend 3','Chat with Friend 5'],
  'latest interaction wins over presence, and friends without messages remain visible');
n.find(x => x.props.accessibilityLabel === 'View Friend 6').props.onPress();
assert.equal(profiles.at(-1), 'f6');
const chat = n.find(x => x.props.accessibilityLabel?.startsWith('Friend 0.'));
assert.ok(chat, 'read messages still have previews'); chat.props.onPress(); assert.deepEqual(opened.at(-1), ['friend', 'f0']);
assert.ok(n.some(x => x.type === 'Text' && text(x) === 'Song · Artist'), 'last message survives marking read');

async function main() {
  let calls = [], error = null;
  const row = { outro: 'room', is_group: true, ultima: iso(0), sender_id: 'me', item_type: 'track', message: null, track_title: 'Song', track_artist: 'Artist' };
  const api = load('src/api/conversationPreviews.ts', { '../lib/supabase': { supabase: { rpc: async name => {
    calls.push(name); return name === 'conversation_summaries' ? { data: [row], error } : { data: [{ outro: 'friend', ultima: iso(0) }], error: null };
  } } } });
  let result = await api.getConversationPreviews(); assert.equal(calls.length, 1); assert.equal(result.previews['group:room'].senderId, 'me');
  error = { code: 'PGRST202' }; calls = []; result = await api.getConversationPreviews(); assert.equal(result.complete, false); assert.equal(calls.length, 2);
  error = { code: 'network' }; calls = []; await assert.rejects(api.getConversationPreviews()); assert.equal(calls.length, 1, 'network failure does not double reads');
  const db = new PGlite();
  const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const as = n => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${uid(n)}',false);`);
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,public to authenticated,anon;
      alter default privileges in schema public grant execute on functions to anon;
      create table shared_items(id uuid primary key, sender_id uuid, recipient_id uuid, group_id uuid, item_type text, message text, track_data jsonb, created_at timestamptz);
      create table chat_group_members(group_id uuid,user_id uuid);
      alter table shared_items enable row level security;
      alter table chat_group_members enable row level security;
      create policy members on chat_group_members for select to authenticated using(user_id=auth.uid());
      create policy messages on shared_items for select to authenticated using(auth.uid() in(sender_id,recipient_id) or exists(select 1 from chat_group_members m where m.group_id=shared_items.group_id and m.user_id=auth.uid()));
      grant select on shared_items,chat_group_members to authenticated;
      insert into chat_group_members values('${uid(50)}','${uid(1)}'),('${uid(50)}','${uid(2)}');`);
    for (const [id, sender, recipient, group, at] of [[100, 2, 1, null, 1], [101, 1, 2, null, 2], [102, 2, null, 50, 3], [103, 3, 4, null, 4]]) {
      await db.query('insert into shared_items values($1,$2,$3,$4,$5,$6,$7,$8)', [uid(id), uid(sender), recipient && uid(recipient), group && uid(group), 'track', 'x'.repeat(600), { title: 'Song', artist: 'Artist', artworkUrl: 'not needed', aSeguir: ['large'] }, iso(at)]);
    }
    const sql = fs.readFileSync(path.join(__dirname, '../supabase/social-conversation-summaries.sql'), 'utf8');
    await db.exec(sql); await db.exec(sql);
    await as(1); let rows = (await db.query('select * from conversation_summaries()')).rows;
    assert.equal(rows.length, 2); assert.equal(rows.find(r => !r.is_group).sender_id, uid(1), 'includes outgoing latest message');
    assert.equal(rows.find(r => r.is_group).outro, uid(50)); assert.equal(rows[0].message.length, 360);
    assert.ok(!('track_data' in rows[0]), 'no whole track or queue payload');
    await as(3); rows = (await db.query('select * from conversation_summaries()')).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].outro, uid(4), 'RLS hides other conversations');
    await db.exec('reset role; set role anon;'); await assert.rejects(db.query('select * from conversation_summaries()'), /permission denied/);
    await db.exec(`reset role; delete from shared_items where id='${uid(101)}';`); await as(1);
    assert.equal((await db.query('select * from conversation_summaries() where is_group=false')).rows[0].sender_id, uid(2), 'deleted latest falls back to older message');
  } finally { await db.close(); }
  console.log('Social compacto: presença válida, privacidade, títulos, três cartões, lista única por interação, resumos nas duas direções e SQL/RLS passaram.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
