import assert from 'node:assert/strict';
import { aceitar, escolher, titulosCasam, duracoesCasam, normalizar } from '../src/lib/catalogoDaFaixa.ts';
import { chaveDeArtista } from '../src/lib/artistName.ts';

const mesmaChave = (a: string, b: string) => !!chaveDeArtista(a) && chaveDeArtista(a) === chaveDeArtista(b);

// --- normalizar e casar títulos ---
assert.equal(normalizar('Hymn For The Weekend (Official Video)'), 'hymn for the weekend');
assert.equal(titulosCasam('BENZO [Official Audio]', 'BENZO'), true);
assert.equal(titulosCasam('Spiral', 'Spiral'), true);
// Curto de mais para se aceitar por conter: `Go` está dentro de milhares.
assert.equal(titulosCasam('Go', 'Go Crazy'), false);
assert.equal(titulosCasam('', 'Qualquer'), false);

// --- durações ---
assert.equal(duracoesCasam(212, 214), true, 'dois segundos ainda é a mesma gravação');
assert.equal(duracoesCasam(212, 230), false);
assert.equal(duracoesCasam(null, 212), false, 'sem duração não decide');
assert.equal(duracoesCasam(212, 0), false);

// --- o caminho seguro: o artista bate certo ---
const carti = { titulo: '@ MEH', artista: 'Playboi Carti', artistaFiavel: true, duracaoSegundos: 148 };
assert.equal(aceitar(carti, { titulo: '@ MEH', artista: 'Playboi Carti', duracao: 148 }, mesmaChave), 'artista');
// Artista diferente e sem duração: recusa.
assert.equal(aceitar(carti, { titulo: '@ MEH', artista: 'Outro Qualquer', duracao: null }, mesmaChave), null);

// --- A ARMADILHA MEDIDA: título genérico apanha a música mais famosa ---
// `Blac Youngsta · So What` dava `P!nk · So What` numa busca só por título.
const soWhat = { titulo: 'So What', artista: 'Blac Youngsta', artistaFiavel: false, duracaoSegundos: 180 };
assert.equal(aceitar(soWhat, { titulo: 'So What', artista: 'P!nk', duracao: 275 }, mesmaChave), null,
  'durações diferentes travam o título genérico');
// A mesma faixa, com a duração a bater: aí sim.
assert.equal(aceitar(soWhat, { titulo: 'So What', artista: 'Blac Youngsta', duracao: 181 }, mesmaChave), 'duracao');

// Sem artista de confiança, o título tem de ser EXACTO: conter não chega.
const semArtista = { titulo: 'Devil In A New Dress', artista: 'Release', artistaFiavel: false, duracaoSegundos: 232 };
assert.equal(aceitar(semArtista, { titulo: 'Devil In A New Dress', artista: 'Kanye West', duracao: 233 }, mesmaChave), 'duracao');
assert.equal(aceitar(semArtista, { titulo: 'Devil In A New Dress (Live)', artista: 'Kanye West', duracao: 999 }, mesmaChave), null);

// Sem duração nossa não há segunda prova, e o artista não é de confiança.
const semNada = { titulo: 'Broke Boys', artista: 'lowkeypatch', artistaFiavel: false, duracaoSegundos: null };
assert.equal(aceitar(semNada, { titulo: 'Broke Boys', artista: 'Drake', duracao: 200 }, mesmaChave), null,
  'sem prova nenhuma fica com o que já tinha');

// --- escolher percorre e devolve a prova ---
const escolhido = escolher(carti, [
  { titulo: 'Outra Coisa', artista: 'Playboi Carti', duracao: 148 },
  { titulo: '@ MEH', artista: 'Playboi Carti', duracao: 148 },
], mesmaChave);
assert.equal(escolhido?.candidato.artista, 'Playboi Carti');
assert.equal(escolhido?.prova, 'artista');
assert.equal(escolher(carti, [], mesmaChave), null);

console.log('Catálogo da faixa: título, duração, e a recusa dos títulos genéricos passaram.');
