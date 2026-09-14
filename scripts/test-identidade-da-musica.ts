/**
 * A mesma música em uploads diferentes -- e músicas diferentes que NÃO podem
 * casar. Os pares são títulos como o YouTube os escreve: de um lado a versão
 * guardada na biblioteca, do outro a que a descoberta devolve (título do vídeo,
 * artista do catálogo). Medido a 14/9, a receita antiga acertava 24 de 31.
 * Ver src/lib/identidadeDaMusica.ts.
 */
import { chavesDaMusica, tituloDeIdentidade } from '../src/lib/identidadeDaMusica.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};

type F = { title: string; artist: string };
let n = 0;
const faixa = (t: F) => ({ source: 'youtube' as const, sourceId: `f${n++}`, ...t });
const daMusica = (t: F) => chavesDaMusica(faixa(t)).filter((k) => !k.startsWith('youtube:'));
const mesmaMusica = (a: F, b: F) => {
  const deA = new Set(daMusica(a));
  return daMusica(b).some((k) => deA.has(k));
};

const iguais: [string, F, F][] = [
  ['Topic vs vídeo oficial', { title: 'Lucid Dreams', artist: 'Juice WRLD - Topic' }, { title: 'Juice WRLD - Lucid Dreams (Official Music Video)', artist: 'Juice WRLD' }],
  ['canal de terceiros vs título simples', { title: 'Juice WRLD - Lucid Dreams (Directed by Cole Bennett)', artist: 'Lyrical Lemonade' }, { title: 'Lucid Dreams', artist: 'Juice WRLD' }],
  ['VEVO', { title: 'Future - Mask Off', artist: 'FutureVEVO' }, { title: 'Future - Mask Off (Official Music Video)', artist: 'Future' }],
  ['ft. fora de parênteses nos dois', { title: 'Travis Scott - SICKO MODE ft. Drake', artist: 'TravisScottVEVO' }, { title: 'Travis Scott - SICKO MODE (Official Audio) ft. Drake', artist: 'Travis Scott' }],
  ['ft. só num dos lados', { title: 'SICKO MODE', artist: 'Travis Scott - Topic' }, { title: 'Travis Scott - SICKO MODE ft. Drake', artist: 'Travis Scott' }],
  ['feat. entre parênteses só num lado', { title: 'Rich Flex (feat. 21 Savage)', artist: 'Drake - Topic' }, { title: 'Drake - Rich Flex', artist: 'Drake' }],
  ['maiúsculas', { title: 'DILLAZ - MAIS FORTE', artist: 'Dillaz' }, { title: 'Dillaz - Mais Forte (Videoclip Oficial)', artist: 'Dillaz' }],
  ['acentos', { title: 'Mariza - Ó Gente da Minha Terra', artist: 'Mariza' }, { title: 'Mariza - O Gente Da Minha Terra (Official Video)', artist: 'Mariza' }],
  ['canal de letras', { title: 'Juice WRLD - Robbery (Lyrics)', artist: '7clouds Rap' }, { title: 'Juice WRLD - Robbery (Official Video)', artist: 'Juice WRLD' }],
  ['título invertido', { title: 'Robbery - Juice WRLD', artist: 'Lyrics Hub' }, { title: 'Juice WRLD - Robbery', artist: 'Juice WRLD' }],
  ['colaboração x vs &', { title: 'Juice WRLD x Marshmello - Come & Go (Official Audio)', artist: 'Juice WRLD' }, { title: 'Juice WRLD & Marshmello - Come & Go', artist: 'Juice WRLD' }],
  ['Topic de uma colaboração', { title: 'Come & Go', artist: 'Juice WRLD - Topic' }, { title: 'Juice WRLD & Marshmello - Come & Go', artist: 'Juice WRLD' }],
  ['parênteses retos', { title: 'Lil Uzi Vert - XO Tour Llif3 [Official Audio]', artist: 'Lil Uzi Vert' }, { title: 'Lil Uzi Vert - XO TOUR Llif3 (Official Music Video)', artist: 'Lil Uzi Vert' }],
  ['canal = artista, sem separador', { title: 'XO Tour Llif3', artist: 'Lil Uzi Vert' }, { title: 'Lil Uzi Vert - XO Tour Llif3', artist: 'Lil Uzi Vert' }],
  ['aspas no título', { title: 'Kendrick Lamar - "HUMBLE."', artist: 'KendrickLamarVEVO' }, { title: 'Kendrick Lamar - HUMBLE. (Official Video)', artist: 'Kendrick Lamar' }],
  ['barra vertical', { title: 'Bispo - Lua | Official Video', artist: 'Bispo' }, { title: 'Bispo - Lua (Videoclip)', artist: 'Bispo' }],
  ['Official Video sem parênteses', { title: 'Plutonio - Sushi Official Video', artist: 'Plutonio' }, { title: 'Plutónio - Sushi', artist: 'Plutónio' }],
  ['versão slowed guardada', { title: 'Juice WRLD - All Girls Are The Same (Slowed + Reverb)', artist: 'slowed vibes' }, { title: 'Juice WRLD - All Girls Are The Same', artist: 'Juice WRLD' }],
  ['travessão e apóstrofo curvo', { title: 'Drake – God’s Plan', artist: 'DrakeVEVO' }, { title: "Drake - God's Plan", artist: 'Drake' }],
  ['artista no vídeo, sugestão só com título', { title: 'Travis Scott - HIGHEST IN THE ROOM (Official Music Video)', artist: 'TravisScottVEVO' }, { title: 'HIGHEST IN THE ROOM', artist: 'Travis Scott' }],
  ['número de faixa', { title: '01. Lucid Dreams', artist: 'Juice WRLD - Topic' }, { title: 'Juice WRLD - Lucid Dreams', artist: 'Juice WRLD' }],
  ['prod. entre parênteses', { title: 'Juice WRLD - Wishing Well (Prod. Nick Mira)', artist: 'Juice WRLD' }, { title: 'Juice WRLD - Wishing Well (Official Music Video)', artist: 'Juice WRLD' }],
  ['prod. sem parênteses', { title: 'Juice WRLD - Wishing Well prod. Nick Mira', artist: 'Juice WRLD' }, { title: 'Juice WRLD - Wishing Well', artist: 'Juice WRLD' }],
  ['A$AP', { title: 'A$AP Rocky - Praise The Lord (Da Shine) ft. Skepta', artist: 'ASAPROCKYUPTOWN' }, { title: 'A$AP Rocky - Praise The Lord (Da Shine) (Official Video) ft. Skepta', artist: 'A$AP Rocky' }],
  ['The Weeknd Topic', { title: 'Blinding Lights', artist: 'The Weeknd - Topic' }, { title: 'The Weeknd - Blinding Lights (Official Video)', artist: 'The Weeknd' }],
  ['artistas separados por vírgula', { title: 'Rich Flex', artist: 'Drake - Topic' }, { title: 'Drake, 21 Savage - Rich Flex (Audio)', artist: 'Drake' }],
  ['LYRIC VIDEO em maiúsculas', { title: 'Juice WRLD - Legends (LYRIC VIDEO)', artist: 'Juice WRLD' }, { title: 'Juice WRLD - Legends', artist: 'Juice WRLD' }],
  ['Audio sem parênteses', { title: 'Future - Mask Off Audio', artist: 'Future' }, { title: 'Future - Mask Off', artist: 'Future' }],
  // Apanhados num segundo lote, que não tinha servido para afinar.
  ['artista à frente sem hífen', { title: 'Juice WRLD "Righteous" (Official Video)', artist: 'Juice WRLD' }, { title: 'Righteous', artist: 'Juice WRLD' }],
  ['hífen dentro do nome do artista', { title: 'Blink-182 - All The Small Things', artist: 'blink182VEVO' }, { title: 'blink-182 - All The Small Things (Official Music Video)', artist: 'blink-182' }],
];

const diferentes: [string, F, F][] = [
  ['o mesmo artista, outra música', { title: 'Juice WRLD - Lucid Dreams', artist: 'Juice WRLD' }, { title: 'Juice WRLD - Robbery', artist: 'Juice WRLD' }],
  ['um título que começa como o outro', { title: "Drake - Hold On, We're Going Home", artist: 'DrakeVEVO' }, { title: 'Justin Bieber - Hold On', artist: 'Justin Bieber' }],
  ['o mesmo título, outro artista', { title: 'Kanye West - Stronger', artist: 'KanyeWestVEVO' }, { title: 'Kelly Clarkson - Stronger', artist: 'Kelly Clarkson' }],
];

console.log('\na mesma música noutro upload');
for (const [rotulo, guardada, sugestao] of iguais) check(rotulo, mesmaMusica(guardada, sugestao));

console.log('\nmúsicas diferentes não se juntam');
for (const [rotulo, a, b] of diferentes) check(rotulo, !mesmaMusica(a, b));

console.log('\no título');
check('uma música que se chama "Audio" continua a ter nome', tituloDeIdentidade('Audio') === 'audio');
check('"Video Games" não perde o "Video"', tituloDeIdentidade('Video Games') === 'video games');
check('as chaves cabem na memória dos 30 dias',
  chavesDaMusica(faixa({ title: 'Drake, 21 Savage - Rich Flex (Audio)', artist: 'Drake - Topic' })).length <= 12);

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
