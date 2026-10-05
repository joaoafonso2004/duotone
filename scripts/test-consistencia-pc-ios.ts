/**
 * Fase 1 da auditoria de consistência PC ↔ iPhone (5/10,
 * docs/AUDITORIA-CONSISTENCIA-PC-IOS.md). Prende o nome do "voltar" do PC
 * (src/lib/voltarPara.ts) e lê os ficheiros para as regras que não têm lógica
 * própria: uma só partilha no PC, folhas de desktop no PC, a conversa aberta
 * direto, as Definições à vista no perfil do iPhone e os ícones partilhados.
 *
 * Correr: node --experimental-strip-types scripts/test-consistencia-pc-ios.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MAXIMO_DO_NOME, nomeDaRota } from '../src/lib/voltarPara.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8');
const todos = (pasta: string): string[] => readdirSync(pasta, { withFileTypes: true })
  .flatMap((d) => d.isDirectory() ? todos(join(pasta, d.name)) : [join(pasta, d.name)]);

console.log('\no "voltar" do PC diz para onde vai (N7)');
caso('uma secção leva o nome da lateral', () => {
  assert.equal(nomeDaRota({ name: 'search' }), 'Search');
  assert.equal(nomeDaRota({ name: 'songs' }), 'Liked Songs');
  assert.equal(nomeDaRota({ name: 'library-check' }), 'Library check');
});
caso('um artista, uma playlist ou uma mistura levam o nome deles', () => {
  assert.equal(nomeDaRota({ name: 'artist', value: 'Isak Zigarro' }), 'Isak Zigarro');
  assert.equal(nomeDaRota({ name: 'playlist', id: 'p1', title: 'Treino' }), 'Treino');
  assert.equal(nomeDaRota({ name: 'mistura', id: 'm1', titulo: 'Late night' }), 'Late night');
});
caso('sem histórico diz Playlists, que é para onde o back() vai', () => {
  assert.equal(nomeDaRota(undefined), 'Playlists');
});
caso('um nome comprido é cortado com reticências', () => {
  const r = nomeDaRota({ name: 'playlist', id: 'p', title: 'Uma playlist com um nome muito comprido demais' });
  assert.ok(r.length <= MAXIMO_DO_NOME && r.endsWith('…'), r);
});
caso('um nome vazio cai no da secção', () => {
  assert.equal(nomeDaRota({ name: 'artist', value: '  ' }), 'Back');
  assert.equal(nomeDaRota({ name: 'playlist', id: 'p', title: '' }), 'Back');
});
caso('nenhuma página do PC escreve o destino do voltar à mão', () => {
  const culpados = todos('src/desktop').filter((f) => /\.tsx$/.test(f))
    .filter((f) => /icon="arrow-back" onPress=\{back\}>/.test(ler(f)));
  assert.deepEqual(culpados, [], 'usar o <BotaoVoltar onPress={back} />');
});
caso('a casca dá o nome a partir do histórico', () => {
  const casca = ler('src/navigation/RootNavigator.web.tsx');
  assert.match(casca, /RotuloDoVoltar\.Provider/);
  assert.match(casca, /nomeDaRota\(nowPlayingOpen \? route : history\.current/);
});

console.log('\nfolhas e partilha no PC (M2, M3, T4)');
caso('o BottomSheet tem par web com as mesmas exportações', () => {
  const nomes = (f: string) => [...ler(f).matchAll(/^export (?:function|const) (\w+)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(nomes('src/components/BottomSheet.web.tsx'), nomes('src/components/BottomSheet.tsx'));
});
caso('no PC a folha é o Dialog de desktop', () => {
  assert.match(ler('src/components/BottomSheet.web.tsx'), /<Dialog open title=\{titulo \?\? ''\} onClose=\{onClose\}/);
});
caso('a casca do PC não tem uma segunda janela de partilha', () => {
  const casca = ler('src/navigation/RootNavigator.web.tsx');
  assert.ok(!casca.includes('SELECT FRIENDS'), 'o diálogo antigo voltou');
  assert.match(casca, /<ShareFriendSheet visible=\{!!shareTarget\}/);
});
caso('Share e Add to playlist dão o título à folha', () => {
  assert.match(ler('src/components/ShareFriendSheet.tsx'), /<BottomSheet visible=\{visible\} onClose=\{onClose\} titulo=/);
  assert.match(ler('src/components/AddToPlaylistSheet.tsx'), /titulo="Add to playlist"/);
});

console.log('\nperfil e conversas no iPhone (P3, N5)');
caso('"Message" abre a conversa direto, sem passar pelo Social', () => {
  for (const f of ['src/screens/ProfileScreen.tsx', 'src/screens/FriendProfileScreen.tsx']) {
    assert.match(ler(f), /onMessage=\{id=>navigation\.navigate\('Conversa',\{kind:'friend',id\}\)\}/, f);
  }
});
caso('o toque numa notificação também', () => {
  assert.match(ler('src/navigation/RootNavigator.tsx'), /navigationRef\.navigate\('Conversa', conversa\)/);
});
caso('as Definições estão à vista no perfil, e não no "⋯"', () => {
  const perfil = ler('src/components/SocialProfileView.tsx');
  assert.ok(!/label:'Settings'/.test(perfil), 'voltou para dentro do menu');
  assert.match(perfil, /<BotoesDoPerfil [^>]*onSettings=\{onSettings\}/);
  assert.match(ler('src/components/ProfileHero.tsx'), /own&&onSettings&&<BotaoDeVidro label="Settings" icon="settings-outline"/);
});

console.log('\nícones e rótulos (N3, N6, N9, T8)');
caso('Artists usa o microfone nos dois lados', () => {
  assert.match(ler('src/navigation/BarraDeSeparadores.tsx'), /Artists: ICONES\.artistas/);
  assert.match(ler('src/desktop/rotas.ts'), /icon: `\$\{ICONES\.artistas\}-outline`/);
});
caso('o Jam usa os auscultadores, não o ícone do Social', () => {
  assert.match(ler('src/desktop/casca.web.tsx'), /name=\{jam \? ICONES\.jam : `\$\{ICONES\.jam\}-outline`\}/);
  assert.match(ler('src/components/AmigosAOuvir.tsx'), /sessao \? ICONES\.jam/);
  assert.match(ler('src/desktop/AmigosNaLateral.web.tsx'), /sessoes\.has\(a\.friendId\) \? ICONES\.jam/);
});
caso('a lateral do PC não chama "DISCOVER" à biblioteca', () => {
  assert.ok(!ler('src/desktop/casca.web.tsx').includes('>DISCOVER<'));
});

if (falhas) { console.log(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\n  Todos os casos passaram.');
