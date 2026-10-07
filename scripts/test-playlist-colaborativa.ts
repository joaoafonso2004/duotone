/**
 * Playlists colaborativas (src/lib/playlistColaborativa.ts): o papel de cada
 * um, o que pode fazer, quem se pode convidar e as caras.
 *
 * Correr: node --experimental-strip-types scripts/test-playlist-colaborativa.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  amigosParaConvidar, eColaborativa, MAXIMO_DE_COLABORADORES, metaDaPlaylist, nomeDaPessoa, papelNaPlaylist,
  podeGerir, podeMexerNasFaixas, quemPos, resumoDasPessoas, vagasParaColaboradores, type PessoaDaPlaylist,
} from '../src/lib/playlistColaborativa.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}

const pessoa = (id: string, papel: 'dono' | 'colaborador', nome = id): PessoaDaPlaylist =>
  ({ id, papel, nome, username: id.toLowerCase(), avatarUrl: null });
const dono = pessoa('ana', 'dono', 'Ana');
const rui = pessoa('rui', 'colaborador', 'Rui');
const eva = pessoa('eva', 'colaborador', 'Eva');

caso('o papel: dono, colaborador, leitor', () => {
  assert.equal(papelNaPlaylist({ donoId: 'ana', eu: 'ana', pessoas: [] }), 'dono', 'sem a migração o dono continua dono');
  assert.equal(papelNaPlaylist({ donoId: 'ana', eu: 'rui', pessoas: [dono, rui] }), 'colaborador');
  assert.equal(papelNaPlaylist({ donoId: 'ana', eu: 'zé', pessoas: [dono, rui] }), 'leitor');
  assert.equal(papelNaPlaylist({ donoId: 'ana', eu: null, pessoas: [dono, rui] }), 'leitor');
  // Um "dono" na lista que não é o dono da playlist não dá licença nenhuma.
  assert.equal(papelNaPlaylist({ donoId: 'ana', eu: 'zé', pessoas: [pessoa('zé', 'dono')] }), 'leitor');
});
caso('o que cada um pode', () => {
  assert.deepEqual(['dono', 'colaborador', 'leitor'].map((p) => podeMexerNasFaixas(p as any)), [true, true, false]);
  assert.deepEqual(['dono', 'colaborador', 'leitor'].map((p) => podeGerir(p as any)), [true, false, false]);
});
caso('só amigos aceites que ainda não lá estão, por nome', () => {
  const amigos = [
    { friendId: 'rui', status: 'accepted' as const, name: 'Rui', username: 'rui' },
    { friendId: 'zé', status: 'accepted' as const, name: 'zé', username: 'ze' },
    { friendId: 'bia', status: 'accepted' as const, name: 'Bia', username: 'bia' },
    { friendId: 'pendente', status: 'pending' as const, name: 'Aaa', username: 'p' },
    { friendId: 'bia', status: 'accepted' as const, name: 'Bia', username: 'bia' },
  ];
  assert.deepEqual(amigosParaConvidar(amigos, [dono, rui]).map((a) => a.friendId), ['bia', 'zé']);
});
caso('as vagas batem com o teto do SQL', () => {
  const sql = readFileSync('supabase/playlists-colaborativas.sql', 'utf8');
  assert.match(sql, new RegExp(`> ${MAXIMO_DE_COLABORADORES} then`));
  assert.equal(vagasParaColaboradores([dono, rui, eva]), MAXIMO_DE_COLABORADORES - 2);
  const cheia = [dono, ...Array.from({ length: 25 }, (_, i) => pessoa(`c${i}`, 'colaborador'))];
  assert.equal(vagasParaColaboradores(cheia), 0);
});
caso('as caras de quem pôs: só numa playlist com colaboradores', () => {
  assert.equal(quemPos('ana', [dono]), null, 'sem colaboradores seria a mesma cara em todas');
  assert.equal(quemPos('rui', [dono, rui])?.nome, 'Rui');
  assert.equal(quemPos('saiu', [dono, rui]), null, 'quem saiu já não tem cara');
  assert.equal(quemPos(null, [dono, rui]), null, 'as linhas antigas não têm');
  assert.ok(eColaborativa([dono, rui]) && !eColaborativa([dono]));
});
caso('a linha por baixo do título', () => {
  assert.equal(resumoDasPessoas([dono]), null);
  assert.equal(resumoDasPessoas([dono, rui])?.texto, 'Ana and Rui');
  const tres = resumoDasPessoas([rui, eva, dono, pessoa('zé', 'colaborador', 'Zé')]);
  assert.equal(tres?.texto, 'Ana and 3 others', 'o dono primeiro, venha a ordem que vier');
  assert.deepEqual(tres?.caras.map((p) => p.id), ['ana', 'rui', 'eva']);
  assert.equal(nomeDaPessoa({ nome: ' ', username: 'x' }), '@x');
});
caso('a linha da lista diz que é colaborativa', () => {
  assert.equal(metaDaPlaylist({ trackCount: 1 }), '1 track');
  assert.equal(metaDaPlaylist({ trackCount: 3, colaborativa: true }), 'Collaborative · 3 tracks');
});

caso('ao vivo: as duas páginas ouvem os avisos, sem se relerem com as próprias mudanças', () => {
  const ios = readFileSync('src/screens/PlaylistDetailScreen.tsx', 'utf8');
  const pc = readFileSync('src/desktop/paginas/PlaylistPages.web.tsx', 'utf8');
  for (const [nome, f] of [['iPhone', ios], ['PC', pc]] as const) {
    assert.ok(f.includes('usePlaylistAoVivo(id,eColaborativa(pessoas),userId,'), nome + ': só com colaboradores, e sabendo quem sou');
  }
  const gancho = readFileSync('src/hooks/usePlaylistAoVivo.ts', 'utf8');
  assert.ok(gancho.includes('por !== eu'), 'as minhas mudanças não releem nada (logs)');
  assert.ok(pc.includes('label="Refresh playlist"'), 'o PC tem botão de refrescar');
  assert.ok(ios.includes('refreshControl={puxar}'), 'o iPhone puxa para atualizar');
  // O PC reabria a cópia guardada sem confirmar nunca; confirma, mas só quando
  // outra pessoa a pode ter mudado, e não a cada visita.
  assert.ok(pc.includes('precisaDeConfirmar(guardada, userId)'));
  assert.ok(pc.includes('CONFIRMAR_DEPOIS_MS = 30_000'));
});
caso('as caras centram-se por baixo do título no iPhone', () => {
  const comp = readFileSync('src/components/PessoasDaPlaylist.tsx', 'utf8');
  const estilo = comp.slice(comp.indexOf('  caras: {'), comp.indexOf('\n', comp.indexOf('  caras: {')));
  assert.ok(estilo.length > 0 && !estilo.includes('alignSelf'), 'o alinhamento não vem preso no estilo');
  assert.ok(readFileSync('src/desktop/paginas/PlaylistPages.web.tsx', 'utf8').includes('CarasDaPlaylist alinhar="flex-start"'));
});

if (falhas) { console.log(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\n  Todos os casos passaram.');
