/**
 * Fase 3 da auditoria de consistência PC ↔ iPhone (5/10,
 * docs/AUDITORIA-CONSISTENCIA-PC-IOS.md): os destinos neutros
 * (src/lib/destinos.ts), a tradução de cada plataforma, a pilha por separador
 * do iPhone (N8) e o fim dos dois canais de navegação do PC (T3).
 *
 * Correr: node --experimental-strip-types scripts/test-destinos.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  PORTAS_DA_CASCA, TIPOS_DE_DESTINO, destinoDoRecente, mostrarPorta, podeIrPara, rotaNoIphone, rotaNoPc,
  type Destino, type TipoDeDestino,
} from '../src/lib/destinos.ts';
import { modoDaDoca } from '../src/lib/doca.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8');
const todos = (pasta: string): string[] => readdirSync(pasta, { withFileTypes: true })
  .flatMap((d) => d.isDirectory() ? todos(join(pasta, d.name)) : [join(pasta, d.name)]);

/** Um exemplo de cada destino, para correr as duas tabelas. */
const EXEMPLOS: Record<TipoDeDestino, Destino> = {
  inicio: { tipo: 'inicio' },
  gostadas: { tipo: 'gostadas' },
  artistas: { tipo: 'artistas' },
  playlists: { tipo: 'playlists' },
  social: { tipo: 'social' },
  perfil: { tipo: 'perfil', userId: 'u1' },
  definicoes: { tipo: 'definicoes' },
  'a-tocar': { tipo: 'a-tocar' },
  artista: { tipo: 'artista', nome: 'Isak' },
  album: { tipo: 'album', nome: 'Ultra' },
  playlist: { tipo: 'playlist', id: 'p1', nome: 'Treino' },
  mistura: { tipo: 'mistura', id: 'estilo:rap', nome: 'Rap mix' },
  prateleira: { tipo: 'prateleira', nome: 'heavy', titulo: 'Heavy Rotation' },
  'mistura-do-dia': { tipo: 'mistura-do-dia' },
  conversa: { tipo: 'conversa', kind: 'friend', id: 'u2' },
  estatisticas: { tipo: 'estatisticas' },
  retrospetiva: { tipo: 'retrospetiva', ano: 2026 },
  'voces-os-dois': { tipo: 'voces-os-dois', userId: 'u2', nome: 'Rui' },
  downloads: { tipo: 'downloads' },
  'library-check': { tipo: 'library-check' },
  importar: { tipo: 'importar' },
};

console.log('\nos destinos e as duas tabelas (T1)');
caso('todos os tipos têm exemplo, e as duas tabelas conhecem todos', () => {
  assert.deepEqual([...TIPOS_DE_DESTINO].sort(), Object.keys(EXEMPLOS).sort());
});
caso('o que falta num lado está NOMEADO: um buraco novo é uma decisão, não um esquecimento', () => {
  const semPc = TIPOS_DE_DESTINO.filter((t) => !podeIrPara('pc', t)).sort();
  const semIphone = TIPOS_DE_DESTINO.filter((t) => !podeIrPara('ios', t)).sort();
  // PC: os álbuns abrem num diálogo, as prateleiras vivem na página principal,
  // e o leitor do PC não guarda áudio. iPhone: o leitor é uma camada, não um sítio.
  assert.deepEqual(semPc, ['album', 'downloads', 'mistura-do-dia', 'prateleira']);
  assert.deepEqual(semIphone, ['a-tocar']);
});
caso('a tradução existe exatamente quando o podeIrPara diz que sim', () => {
  for (const t of TIPOS_DE_DESTINO) {
    assert.equal(rotaNoPc(EXEMPLOS[t]) !== null, podeIrPara('pc', t), `pc ${t}`);
    assert.equal(rotaNoIphone(EXEMPLOS[t]) !== null, podeIrPara('ios', t), `ios ${t}`);
  }
});

console.log('\nno PC: as rotas existem (desktop/rotas.ts)');
const rotas = ler('src/desktop/rotas.ts');
const nomesDoPc = new Set([
  ...[...rotas.matchAll(/name:\s*'([a-z-]+)'/g)].map((m) => m[1]),
  ...(/export type PrimaryRoute =([^;]+);/.exec(rotas)?.[1].match(/'([a-z-]+)'/g) ?? []).map((s) => s.slice(1, -1)),
]);
caso('cada rota do PC é um nome da união Route', () => {
  for (const t of TIPOS_DE_DESTINO) {
    const r = rotaNoPc(EXEMPLOS[t]);
    if (r) assert.ok(nomesDoPc.has(r.name), `${t} -> ${r.name}`);
  }
});
caso('os parâmetros chegam com o nome que a página lê', () => {
  assert.deepEqual(rotaNoPc({ tipo: 'artista', nome: 'Isak' }), { name: 'artist', value: 'Isak' });
  assert.deepEqual(rotaNoPc({ tipo: 'playlist', id: 'p1' }), { name: 'playlist', id: 'p1', title: 'Playlist' });
  assert.deepEqual(rotaNoPc({ tipo: 'conversa', kind: 'group', id: 'g1' }), { name: 'social', groupId: 'g1' });
  assert.deepEqual(rotaNoPc({ tipo: 'conversa', kind: 'friend', id: 'u2' }), { name: 'social', friendId: 'u2' });
  assert.deepEqual(rotaNoPc({ tipo: 'perfil' }), { name: 'profile' });
  assert.deepEqual(rotaNoPc({ tipo: 'perfil', userId: 'u2' }), { name: 'friend-profile', userId: 'u2' });
});

console.log('\nno iPhone: uma pilha por separador (N8, T7)');
const navegador = ler('src/navigation/RootNavigator.tsx');
const naPilha = new Set([...(/function ecrasDaPilha\(\) \{([\s\S]*?)\n\}/.exec(navegador)?.[1] ?? '').matchAll(/name="(\w+)"/g)].map((m) => m[1]));
const separadores = new Set([...navegador.matchAll(/<Tab\.Screen name="(\w+)" component=\{(\w+)\}/g)].map((m) => m[1]));
caso('cada detalhe do iPhone está em todas as pilhas; cada secção é um separador', () => {
  for (const t of TIPOS_DE_DESTINO) {
    const r = rotaNoIphone(EXEMPLOS[t]);
    if (!r) continue;
    if (r.onde === 'pilha') assert.ok(naPilha.has(r.ecra), `${t} -> ${r.ecra} fora do ecrasDaPilha`);
    else assert.ok(separadores.has(r.ecra), `${t} -> separador ${r.ecra}`);
  }
});
caso('todos os separadores são pilhas (pilhaDoSeparador)', () => {
  const componentes = [...navegador.matchAll(/<Tab\.Screen name="\w+" component=\{(\w+)\}/g)].map((m) => m[1]);
  assert.equal(componentes.length, 6);
  for (const c of componentes) assert.match(navegador, new RegExp(`const ${c} = pilhaDoSeparador\\(`), c);
});
caso('na raiz ficam só os separadores e as folhas: nenhum detalhe duplicado', () => {
  const raiz = /<Stack\.Navigator screenOptions=\{stackScreenOptions\} screenLayout=\{envolverEcra\}>\s*<Stack\.Screen name="Tabs"([\s\S]*?)<\/Stack\.Navigator>/.exec(navegador)?.[0] ?? '';
  const nomes = [...raiz.matchAll(/name="(\w+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(nomes, ['Fila', 'Folha', 'Tabs']);
});
caso('dentro de um detalhe o dedo não muda de separador', () => {
  assert.match(navegador, /swipeEnabled: !reducedMotion && naRaiz\(route\)/);
});
caso('um detalhe entra na pilha do separador onde se está, dirigido pela chave', () => {
  assert.match(navegador, /target: pilha\.key/);
  assert.match(navegador, /<DestinosProvider value=\{irPara\}>/);
});
caso('um detalhe dentro de um separador continua com a barra; as Definições e o chat sem base', () => {
  assert.equal(modoDaDoca(['Tabs', 'Search', 'PlaylistDetail']), 'separadores');
  assert.equal(modoDaDoca(['Tabs', 'Profile', 'FriendProfile']), 'separadores');
  assert.equal(modoDaDoca(['Tabs', 'Profile', 'Settings']), 'escondida');
  assert.equal(modoDaDoca(['Tabs', 'Social', 'Conversa']), 'escondida');
});
caso('o leitor e o menu da faixa abrem o artista pelo irPara (a fila é uma folha da raiz)', () => {
  assert.ok(!/navigationRef\.navigate\('LibraryGroup'/.test(ler('src/components/PlayerRoot.tsx')));
  assert.ok(!/navigationRef\.navigate\('LibraryGroup'/.test(ler('src/components/TrackActionsSheet.tsx')));
});

console.log('\nos componentes partilhados pedem um sítio, não recebem uma função por destino (T2)');
caso('o perfil e o Social já não recebem destinos por props', () => {
  const perfil = /export function SocialProfileView\(\{([^}]*)\}/.exec(ler('src/components/SocialProfileView.tsx'))?.[1] ?? '';
  for (const p of ['onMessage', 'onArtist', 'onStats', 'onVocesOsDois', 'onSettings', 'onSocial', 'onPlaylist']) assert.ok(!perfil.includes(p), `SocialProfileView: ${p}`);
  const hub = /export function SocialHub\(\{([^}]*)\}/.exec(ler('src/components/SocialHub.tsx'))?.[1] ?? '';
  for (const p of ['onProfile', 'onPlaylist', 'onArtist', 'onConversation']) assert.ok(!hub.includes(p), `SocialHub: ${p}`);
});
caso('a casca não se repete: no PC o perfil não mostra o Social nem as Definições; no iPhone sim', () => {
  assert.equal(mostrarPorta('pc', 'social'), false);
  assert.equal(mostrarPorta('pc', 'definicoes'), false);
  assert.equal(mostrarPorta('ios', 'social'), true);
  assert.equal(mostrarPorta('ios', 'definicoes'), true);
  // Uma porta da casca tem de existir nessa plataforma.
  for (const p of ['pc', 'ios'] as const) for (const t of PORTAS_DA_CASCA[p]) assert.ok(podeIrPara(p, t), `${p} ${t}`);
});

console.log('\no "Jump back in" é o mesmo nos dois lados');
caso('destinoDoRecente', () => {
  assert.deepEqual(destinoDoRecente({ tipo: 'guardadas', nome: 'Liked Songs' }), { tipo: 'gostadas' });
  assert.deepEqual(destinoDoRecente({ tipo: 'prateleira', nome: 'Daily mix', id: 'doDia' }), { tipo: 'mistura-do-dia' });
  assert.deepEqual(destinoDoRecente({ tipo: 'prateleira', nome: 'Heavy Rotation', id: 'heavy' }), { tipo: 'prateleira', nome: 'heavy', titulo: 'Heavy Rotation' });
  assert.equal(destinoDoRecente({ tipo: 'playlist', nome: 'Sem id' }), null);
  assert.match(ler('src/screens/SearchScreen.tsx'), /destinoDoRecente\(r\)/);
  assert.match(ler('src/desktop/VoltarAOuvir.web.tsx'), /destinoDoRecente\(r\)/);
});

console.log('\num só canal de navegação no PC (T3)');
caso('ninguém navega pelo evento global duotone:navigate', () => {
  const culpados = todos('src').filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => /CustomEvent\('duotone:navigate'|addEventListener\('duotone:navigate'/.test(ler(f)));
  assert.deepEqual(culpados, []);
});

if (falhas) { console.log(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\n  Todos os casos passaram.');
