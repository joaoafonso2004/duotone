/**
 * O título que é o nome da música, e não o artista (11/11) -- `eAMusicaDoCanal`
 * em src/lib/artistName.ts. O João: "diz Bones como o título mas é dos Imagine
 * Dragons". O rapper BONES estava na biblioteca, e a música "Bones" do canal
 * "Imagine Dragons" ficava com ele.
 *
 * Correr: node --experimental-strip-types scripts/test-titulo-que-e-a-musica.ts
 */
import assert from 'node:assert/strict';
import { aprenderVocabulario, displayArtist } from '../src/lib/artistName.ts';

const comBones = aprenderVocabulario([
  { source: 'youtube', title: 'HDMI', artist: 'BONES - Topic' },
  { source: 'youtube', title: 'Believer', artist: 'Imagine Dragons - Topic' },
]);
const soBones = aprenderVocabulario([{ source: 'youtube', title: 'HDMI', artist: 'BONES - Topic' }]);
const artista = (title: string, artist: string, vocabulario = comBones) => displayArtist({ source: 'youtube', title, artist }, vocabulario);

// O caso do João, com e sem os Imagine Dragons no vocabulário.
assert.equal(artista('Bones', 'Imagine Dragons'), 'Imagine Dragons');
assert.equal(artista('Bones', 'Imagine Dragons', soBones), 'Imagine Dragons', 'o título é só o nome: quem diz de quem é, é o canal');
assert.equal(artista('Bones (Official Audio)', 'Imagine Dragons', soBones), 'Imagine Dragons', 'com um sufixo de versão também');

// O canal conhecido ganha a um artista que só aparece no título.
assert.equal(artista('Bones Dancing Tonight', 'Imagine Dragons'), 'Imagine Dragons');

// O que já estava certo continua certo.
assert.equal(artista('Bones', 'Imagine Dragons - Topic'), 'Imagine Dragons', 'do Topic nada muda');
assert.equal(artista('Imagine Dragons - Bones (Official Music Video)', 'ImagineDragonsVEVO'), 'Imagine Dragons', 'o "Artista - Título" vai pelo traço');
assert.equal(artista('BONES - HDMI', 'TeamSESH'), 'BONES', 'uma música do BONES continua a ser do BONES');
assert.equal(artista('bones hdmi slowed', 'Slowed Hub', soBones), 'BONES', 'num canal de uploads, o artista do título ganha');
assert.equal(artista('Bones', 'BONES'), 'BONES', 'o canal é o próprio artista');

console.log('título que é a música: ok');
