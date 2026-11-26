/**
 * Partilhar álbuns com amigos (16/11): o que vai na `shared_items`
 * (lib/albumPartilhado.ts), a linha "Share with a friend…" no menu de um disco
 * (lib/menuDoLancamento.ts) e a ligação nas duas plataformas, lida como texto.
 * O servidor está em test-partilhar-albuns-sql.mjs.
 *
 * Correr: node --experimental-strip-types --import ./scripts/registar-resolver.mjs scripts/test-partilhar-albuns.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { albumPartilhado, legendaDoAlbumPartilhado, paraPartilhar, tipoDoAlbumPartilhado } from '../src/lib/albumPartilhado.ts';
import { menuDoLancamento } from '../src/lib/menuDoLancamento.ts';
import { previaDaConversa } from '../src/lib/previaDaConversa.ts';
import { excertoDaMensagem } from '../src/lib/respostas.ts';

let falhas = 0;
function caso(nome: string, fn: () => void) {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

caso('o álbum vai com as chaves que a lista das conversas já lê, e volta igual', () => {
  const dados = paraPartilhar({ id: 'OLAK5uy_abcdefghij', titulo: ' GNX ', artista: 'Kendrick Lamar', capa: 'https://capa', tipo: 'Album', ano: '2024' });
  assert.deepEqual(dados, { albumId: 'OLAK5uy_abcdefghij', title: 'GNX', artist: 'Kendrick Lamar', artworkUrl: 'https://capa', kind: 'Album', year: '2024' });
  assert.deepEqual(albumPartilhado(dados), { id: 'OLAK5uy_abcdefghij', titulo: 'GNX', artista: 'Kendrick Lamar', capa: 'https://capa', tipo: 'Album', ano: '2024' });
});

caso('sem id válido ou sem título não há partilha; os limites são os do SQL', () => {
  assert.equal(paraPartilhar({ id: 'curto', titulo: 'x' }), null);
  assert.equal(paraPartilhar({ id: "OLAK5uy_a'; drop", titulo: 'x' }), null);
  assert.equal(paraPartilhar({ id: 'OLAK5uy_abcdefghij', titulo: '   ' }), null);
  const longo = paraPartilhar({ id: 'OLAK5uy_abcdefghij', titulo: 'x'.repeat(400), artista: 'a'.repeat(400), capa: 'c'.repeat(1200), tipo: 't'.repeat(60), ano: '1'.repeat(20) })!;
  assert.equal(longo.title!.length, 300);
  assert.equal(longo.artist!.length, 300);
  assert.equal(longo.artworkUrl, null, 'uma capa que não cabe não se corta: fica sem');
  assert.equal(longo.kind!.length, 40);
  assert.equal(longo.year!.length, 12);
  assert.ok(JSON.stringify(longo).length <= 3000, 'cabe no teto do shared_album_valid');
});

caso('o que chega estragado da tabela não se mostra', () => {
  assert.equal(albumPartilhado(null), null);
  assert.equal(albumPartilhado({ title: 'x' }), null);
  assert.equal(albumPartilhado({ albumId: 'OLAK5uy_abcdefghij', title: 7 }), null);
  assert.deepEqual(albumPartilhado({ albumId: 'OLAK5uy_abcdefghij', title: 'GNX', artist: 3 }),
    { id: 'OLAK5uy_abcdefghij', titulo: 'GNX', artista: null, capa: null, tipo: null, ano: null });
});

caso('a legenda e o tipo', () => {
  assert.equal(legendaDoAlbumPartilhado({ artista: 'SZA', ano: '2022', tipo: 'Album' }), 'SZA · 2022');
  assert.equal(legendaDoAlbumPartilhado({ artista: null, ano: null, tipo: 'EP' }), 'EP');
  assert.equal(tipoDoAlbumPartilhado({ tipo: null }), 'Album');
});

caso('o menu de um disco: "Share with a friend…" só onde quem abre sabe partilhar', () => {
  const ids = (partilhar?: boolean) => menuDoLancamento({ tipo: 'Album' }, { semRede: false, guardado: false, partilhar }).map((l) => l.id);
  assert.ok(!ids().includes('partilhar'));
  assert.ok(!ids(false).includes('partilhar'));
  const linhas = menuDoLancamento({ tipo: 'Album' }, { semRede: false, guardado: false, partilhar: true });
  const linha = linhas.find((l) => l.id === 'partilhar');
  assert.equal(linha?.rotulo, 'Share with a friend…', 'as palavras do menu de uma playlist');
  assert.equal(linha?.icone, 'people-outline');
  assert.ok(linhas.findIndex((l) => l.id === 'partilhar') > linhas.findIndex((l) => l.id === 'guardar'), 'depois de guardar');
  assert.ok(menuDoLancamento({ tipo: 'Album' }, { semRede: true, partilhar: true }).find((l) => l.id === 'partilhar')?.motivo, 'sem rede diz porquê');
});

caso('a conversa diz o nome do álbum, e uma resposta cita-o', () => {
  const p = previaDaConversa({ senderId: 'b', itemType: 'album', message: null, trackTitle: 'GNX', trackArtist: 'Kendrick Lamar' }, 'a');
  assert.equal(p.texto, 'GNX · Kendrick Lamar');
  assert.equal(previaDaConversa({ senderId: 'a', itemType: 'album', message: null, trackTitle: null, trackArtist: null }, 'a').texto, 'You shared an album');
  assert.equal(excertoDaMensagem({ itemType: 'album', message: null, playlistId: null, album: { titulo: 'GNX' } }), 'Album · GNX');
});

caso('a API manda e lê o tipo "album"', () => {
  const api = ler('src/api/social.ts');
  assert.match(api, /\} else if \(itemType === 'album'\) \{\n\s+comum\.track_data = dadosDoAlbum\(item\);/);
  assert.match(api, /else if \(itemType === 'album'\) payload\.track_data = dadosDoAlbum\(item\);/, 'também num grupo');
  assert.equal((api.match(/album: ?r\.item_type ?=== ?'album' ?\? ?albumPartilhado\(r\.track_data\) ?: ?null/g) ?? []).length, 3, 'as três leituras');
  assert.match(ler('src/lib/migracoes.ts'), /\{ ficheiro: 'partilhar-albuns\.sql', marca: 'fn:shared_album_valid'/);
});

caso('iPhone: o menu dos discos e dos álbuns guardados partilha, e a conversa abre o álbum', () => {
  const artista = ler('src/screens/LibraryGroupScreen.tsx');
  assert.match(artista, /else if \(acao === 'partilhar'\) setDiscoAPartilhar\(d\);/);
  assert.match(artista, /guardado: albunsGuardados\.has\(discoComMenu\.id\), partilhar: true \}/);
  assert.match(artista, /<ShareFriendSheet\n\s+visible=\{!!discoAPartilhar\}\n\s+itemType="album"/);
  const albuns = ler('src/screens/AlbunsGuardadosScreen.tsx');
  assert.match(albuns, /else if \(acao === 'partilhar'\) setAPartilhar\(a\);/);
  assert.match(albuns, /guardado: true, partilhar: true \}/);
  assert.match(albuns, /itemType="album"\n\s+item=\{aPartilhar\}/);
  const conversa = ler('src/screens/ConversaScreen.tsx');
  // O álbum mandado abre numa página (26/11, item 15 do plano de melhorias), e não numa folha.
  assert.match(conversa, /aoAbrirAlbum=\{\(a\)=>abrirAlbum\(navigation,\{id:a\.id,titulo:a\.titulo,capa:a\.capa,artista:a\.artista,ano:a\.ano,tipo:a\.tipo\}\)\}/);
});

caso('PC: o menu dos discos partilha pela casca, e o Social abre o álbum no diálogo', () => {
  const b = ler('src/desktop/paginas/BibliotecaPages.web.tsx');
  assert.match(b, /partilhar: !!share && eAlbumDoYouTubeMusic\(menu\.d\.id\) \}/);
  assert.match(b, /share\?\.\(\{ itemType: 'album', name: d\.titulo, item: \{/);
  assert.equal((b.match(/useMenuDoDisco\(dialogo, (share|props\.share)\)/g) ?? []).length, 3, 'a pesquisa, os álbuns e o artista');
  assert.match(ler('src/navigation/RootNavigator.web.tsx'), /const common = \{ play, tocarMusica, notify, more, share: openShareDialog \};/);
  assert.match(ler('src/desktop/rotas.ts'), /\| \{ itemType: 'album'; item: AlbumPartilhado; name: string \};/);
  const social = ler('src/desktop/paginas/SocialPage.web.tsx');
  assert.match(social, /aoAbrirAlbum=\{\(a\)=>void dialogo\.abrirAlbum\(/);
  assert.match(social, /\{dialogo\.dialogoDoAlbum\}/);
});

caso('a conversa e os grupos mostram o cartão do álbum', () => {
  assert.match(ler('src/components/SocialHub.tsx'), /\{m\.album&&<SharedAlbumCard semFundo album=\{m\.album\} onPress=\{\(\)=>aoAbrirAlbum\?\.\(m\.album!\)\}\/>\}/);
  assert.match(ler('src/components/GroupChat.tsx'), /\{m\.album&&<SharedAlbumCard album=\{m\.album\} onPress=\{\(\)=>onAlbum\?\.\(m\.album!\)\}\/>\}/);
  for (const f of ['src/components/ShareFriendSheet.tsx', 'src/components/ShareFriendSheet.web.tsx']) {
    const folha = ler(f);
    assert.match(folha, /: itemType === 'album' \? 'Send album to friends'/, f);
    assert.match(folha, /if \(itemType === 'album'\) \{/, `${f}: o que vai à vista`);
  }
});

caso('o francês tem as frases novas', () => {
  const fr = ler('src/i18n/fr.ts');
  for (const k of ['Send album to friends', 'Shared an album', 'You shared an album', 'Sent you an album', "Couldn't share this album."]) {
    assert.ok(fr.includes(`"${k}":`), k);
  }
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\ntest-partilhar-albuns: tudo certo');
