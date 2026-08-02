import { parseSpotifyCsv, toMatchTarget } from '../src/lib/spotifyCsv.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

// 1. Formato Exportify típico: vírgulas e aspas dentro dos campos, e o BOM
//    que o Excel cola ao primeiro cabeçalho.
const csv =
  '﻿"Track URI","Track Name","Artist Name(s)","Album Name","Track Duration (ms)"\n' +
  '"spotify:track:aaa","Hello, Goodbye","The Beatles","Magical Mystery Tour","205000"\n' +
  '"spotify:track:bbb","She Said ""Yes""","Someone","An Album","180500"\n' +
  '"spotify:track:ccc","Solo Track","Artist One, Artist Two","Album","240000"\n';

const r = parseSpotifyCsv(csv);
check('lê as 3 linhas', r.rows.length === 3, String(r.rows.length));
check('o BOM não estraga o cabeçalho', r.rows[0]?.title === 'Hello, Goodbye', r.rows[0]?.title);
check('vírgula dentro do título preservada', !!r.rows[0]?.title.includes(','));
check('aspas escapadas', r.rows[1]?.title === 'She Said "Yes"', r.rows[1]?.title);
check('duração lida', r.rows[0]?.durationMs === 205000, String(r.rows[0]?.durationMs));
check('primeiro de vários artistas', r.rows[2]?.artist === 'Artist One', r.rows[2]?.artist);
check('uri preservado', r.rows[0]?.uri === 'spotify:track:aaa');

// 2. Colunas noutra ordem, com as opcionais do Exportify pelo meio.
const shuffled =
  '"Added At","Artist Name(s)","Danceability","Track Name","Energy","Track Duration (ms)"\n' +
  '"2024-01-01","Radiohead","0.5","Creep","0.8","238000"\n';
const r2 = parseSpotifyCsv(shuffled);
check('deteta colunas pelo nome, não pela posição', r2.rows[0]?.title === 'Creep', r2.rows[0]?.title);
check('duração certa com colunas extra', r2.rows[0]?.durationMs === 238000);

// 3. Linhas inválidas são contadas, não rebentam.
const messy =
  '"Track Name","Artist Name(s)","Track Duration (ms)"\n' +
  '"Sem artista","","200000"\n' +
  '"","Só artista","200000"\n' +
  '\n' +
  '"Boa","Artista","abc"\n';
const r3 = parseSpotifyCsv(messy);
check('ignora linhas sem título ou artista', r3.skipped === 2, 'skipped=' + r3.skipped);
check('aceita a linha válida', r3.rows.length === 1);
check('duração não numérica vira null', r3.rows[0]?.durationMs === null);

// 4. Ponte para o algoritmo de correspondência.
check('ms convertido para segundos', toMatchTarget(r.rows[0]!).durationSec === 205);

// 5. Cabeçalhos em português — o Spotify exporta no idioma da conta, e este
//    é o formato exato de um ficheiro real que rebentava a versão anterior.
const pt =
  '"URI da faixa","Nome da faixa","URI(s) do artista","Nome(s) do artista","URI do álbum",' +
  '"Nome do álbum","URI(s) do artista do álbum","Nome(s) do artista do álbum",' +
  '"Data de lançamento do álbum","URL da imagem do álbum","Número do disco","Número da faixa",' +
  '"Duração da faixa (ms)","URL de prévia da faixa","Explícita","Popularidade","ISRC",' +
  '"Adicionado por","Adicionado em"\n' +
  '"spotify:track:aaa","Moonlight","spotify:artist:x","Juice WRLD","spotify:album:y",' +
  '"Moonlight","spotify:artist:x","Juice WRLD","2018-04-12","https://i.scdn.co/image/z",' +
  '"1","1","178515","","true","0","QZ22B1928684","","2021-04-05T12:04:48Z"\n';
const r5 = parseSpotifyCsv(pt);
check('lê cabeçalhos em português', r5.rows.length === 1, 'linhas=' + r5.rows.length);
check('título português', r5.rows[0]?.title === 'Moonlight', r5.rows[0]?.title);
check('artista português', r5.rows[0]?.artist === 'Juice WRLD', r5.rows[0]?.artist);
check('álbum acentuado', r5.rows[0]?.album === 'Moonlight', r5.rows[0]?.album);
check('duração portuguesa', r5.rows[0]?.durationMs === 178515, String(r5.rows[0]?.durationMs));
// "Nome(s) do artista do álbum" não pode roubar o lugar a "Nome(s) do artista".
check('não confunde artista com artista do álbum', r5.rows[0]?.artist !== 'Juice WRLD, Juice WRLD');

// Acentos decompostos (á = a + acento), como saem de alguns sistemas.
const decomposed = pt.normalize('NFD');
check('acentos decompostos também batem', parseSpotifyCsv(decomposed).rows.length === 1);

// 6. Idioma desconhecido: o cabeçalho não diz nada, o conteúdo diz tudo.
const alien =
  '"AAA","BBB","CCC","DDD","EEE","FFF","GGG","HHH"\n' +
  '"spotify:track:aaa","Kein Titel","spotify:artist:x","Ein Künstler","spotify:album:y",' +
  '"Ein Album","2","198000"\n' +
  '"spotify:track:bbb","Zweiter","spotify:artist:x","Ein Künstler","spotify:album:y",' +
  '"Ein Album","3","210000"\n';
const r6 = parseSpotifyCsv(alien);
check('deteta colunas pelo conteúdo', r6.rows.length === 2, 'linhas=' + r6.rows.length);
check('título por conteúdo', r6.rows[0]?.title === 'Kein Titel', r6.rows[0]?.title);
check('artista por conteúdo', r6.rows[0]?.artist === 'Ein Künstler', r6.rows[0]?.artist);
check('álbum por conteúdo', r6.rows[0]?.album === 'Ein Album', r6.rows[0]?.album);
check('duração por conteúdo, não o nº da faixa', r6.rows[0]?.durationMs === 198000, String(r6.rows[0]?.durationMs));

// 7. Ficheiro que não é um export do Spotify: falha explícita, não silenciosa.
const notSpotify = '"a","b"\n"1","2"\n';
check('sinaliza colunas irreconhecíveis', parseSpotifyCsv(notSpotify).problem === 'unrecognised-columns');

// 8. Degradação.
check('ficheiro vazio não rebenta', parseSpotifyCsv('').rows.length === 0);
check('ficheiro vazio é sinalizado', parseSpotifyCsv('').problem === 'empty');
check('só cabeçalho não rebenta', parseSpotifyCsv('"Track Name","Artist Name(s)"\n').rows.length === 0);
check('só cabeçalho conhecido não é erro', parseSpotifyCsv('"Track Name","Artist Name(s)"\n').problem === undefined);

console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
process.exit(bad ? 1 : 0);
