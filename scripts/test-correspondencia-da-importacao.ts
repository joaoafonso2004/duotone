/**
 * Músicas que a importação deixava em "Not found" e que existiam (10/11). O João:
 * "há demasiadas músicas que ficam como not found sendo que depois na
 * verificação manual obviamente existem".
 *
 * Cada caso é um padrão real do YouTube que o comparador (`lib/trackMatch.ts`)
 * não reconhecia. E, ao lado, os erros que NÃO se podem passar a cometer: uma
 * versão de outro artista, ao vivo ou karaoke a entrar sozinha.
 *
 * Correr: node --experimental-strip-types scripts/test-correspondencia-da-importacao.ts
 */
import { pickBest, type MatchCandidate, type MatchTarget } from '../src/lib/trackMatch.ts';

let falhas = 0;
const confere = (nome: string, ok: boolean, extra = '') => {
  if (!ok) falhas++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${nome}${extra ? '  -> ' + extra : ''}`);
};
const resumo = (r: ReturnType<typeof pickBest>) => r.ranked.map((c) => `${c.id}=${c.score}`).join(' ');

/** Deve entrar sozinha, com este candidato. */
function entra(nome: string, alvo: MatchTarget, candidatos: MatchCandidate[], id: string | string[]) {
  const r = pickBest(candidatos, alvo);
  confere(nome, r.confident && [id].flat().includes(r.best?.id ?? ''), `${r.confident ? 'confiante' : 'duvidosa'} ${resumo(r)}`);
}
/** Não pode entrar sozinha. */
function naoEntra(nome: string, alvo: MatchTarget, candidatos: MatchCandidate[]) {
  const r = pickBest(candidatos, alvo);
  confere(nome, !r.confident, `${r.confident ? 'confiante' : 'duvidosa'} ${resumo(r)}`);
}

console.log('O que ficava em "Not found" e existia:');

// Canais VEVO escrevem o nome colado: "KendrickLamarVEVO" não contém "kendrick lamar".
entra('canal VEVO com o nome colado',
  { title: 'HUMBLE.', artist: 'Kendrick Lamar', durationSec: 177 },
  [
    { id: 'v', title: 'Kendrick Lamar - HUMBLE. (Official Video)', channel: 'KendrickLamarVEVO', durationSec: 185 },
    { id: 'l', title: 'HUMBLE. (Lyrics)', channel: 'Lyrics Hub', durationSec: 177 },
  ], 'v');

// Acentos: o normalizador apagava as letras acentuadas ("plut nio"), e o
// canal sem acento ("Plutonio") já não batia com o artista.
entra('acentos no artista e no título (rap português)',
  { title: 'Não Há Volta', artist: 'Plutónio', durationSec: 215 },
  [{ id: 'a', title: 'Plutónio - Não Há Volta (Videoclip Oficial)', channel: 'Plutonio', durationSec: 228 }], 'a');
entra('título sem acentos no YouTube',
  { title: 'Coração de Gelo', artist: 'WIU', durationSec: 200 },
  [{ id: 'a', title: 'WIU - Coracao de Gelo', channel: 'Bloco Records', durationSec: 203 }], 'a');

// Outras escritas: o normalizador só guardava a-z, e o título ficava vazio.
entra('título em japonês',
  { title: '夜に駆ける', artist: 'YOASOBI', durationSec: 261 },
  [{ id: 'a', title: 'YOASOBI「夜に駆ける」 Official Music Video', channel: 'Ayase / YOASOBI', durationSec: 274 }], 'a');

// O Spotify escreve "- From ..." onde o YouTube não escreve nada.
entra('sufixo "From the Motion Picture" do Spotify',
  { title: 'What Was I Made For? - From The Motion Picture "Barbie"', artist: 'Billie Eilish', durationSec: 222 },
  [{ id: 'a', title: 'Billie Eilish - What Was I Made For? (Official Music Video)', channel: 'BillieEilishVEVO', durationSec: 242 }], 'a');

// Dois uploads da MESMA música com durações diferentes: o áudio oficial 3 s
// mais longo que o Topic. Contavam como rivais e a margem não chegava.
// Qualquer dos dois está certo.
entra('o áudio oficial e o Topic da mesma música',
  { title: 'Moonlight', artist: 'Juice WRLD', durationSec: 158 },
  [
    { id: 'o', title: 'Juice WRLD - Moonlight (Official Audio)', channel: 'Juice WRLD', durationSec: 161 },
    { id: 't', title: 'Moonlight', channel: 'Juice WRLD - Topic', durationSec: 158 },
  ], ['o', 't']);

// Vários artistas: o Spotify junta-os ("Skepta, Playboi Carti"), o canal é de um deles.
entra('vários artistas, o canal é do segundo',
  { title: 'Lean 4 Real', artist: 'Skepta, Playboi Carti', durationSec: 190 },
  [{ id: 'a', title: 'Lean 4 Real', channel: 'Playboi Carti - Topic', durationSec: 190 }], 'a');
entra('"&" num título e "and" no outro',
  { title: 'Salt & Pepper', artist: 'Artista', durationSec: 180 },
  [{ id: 'a', title: 'Artista - Salt and Pepper', channel: 'Artista', durationSec: 181 }], 'a');
entra('feat. no título do Spotify e ft. no YouTube',
  { title: 'Sicko Mode (feat. Drake)', artist: 'Travis Scott', durationSec: 312 },
  [{ id: 'a', title: 'Travis Scott - SICKO MODE ft. Drake', channel: 'TravisScottVEVO', durationSec: 324 }], 'a');
entra('artista com vírgula no nome (Tyler, The Creator)',
  { title: 'EARFQUAKE', artist: 'Tyler, The Creator', durationSec: 190 },
  [{ id: 'a', title: 'EARFQUAKE', channel: 'Tyler, The Creator - Topic', durationSec: 190 }], 'a');

console.log('\nO que continua a NÃO poder entrar sozinho:');

// Um Topic de OUTRO artista é outra gravação (uma versão), mesmo com a duração parecida.
naoEntra('o Topic de outro artista (uma versão)',
  { title: 'Creep', artist: 'Radiohead', durationSec: 238 },
  [{ id: 'c', title: 'Creep', channel: 'Postmodern Jukebox - Topic', durationSec: 239 }]);
naoEntra('ao vivo do próprio artista',
  { title: 'Não Há Volta', artist: 'Plutónio', durationSec: 215 },
  [{ id: 'a', title: 'Plutónio - Não Há Volta (Ao Vivo no Coliseu)', channel: 'Plutonio', durationSec: 240 }]);
naoEntra('outra música do mesmo artista',
  { title: 'Moonlight', artist: 'Juice WRLD', durationSec: 158 },
  [{ id: 'a', title: 'Juice WRLD - Lucid Dreams', channel: 'Juice WRLD - Topic', durationSec: 239 }]);
naoEntra('uma palavra do título não chega',
  { title: 'Lean 4 Real', artist: 'Skepta, Playboi Carti', durationSec: 190 },
  [{ id: 'a', title: 'Skepta - Lean', channel: 'Skepta', durationSec: 150 }]);
naoEntra('karaoke com a duração exata',
  { title: 'Creep', artist: 'Radiohead', durationSec: 238 },
  [{ id: 'k', title: 'Creep (Karaoke Version)', channel: 'Radiohead - Topic', durationSec: 238 }]);

console.log(falhas ? `\n  ${falhas} falha(s)` : '\n  Todos os casos passaram.');
process.exit(falhas ? 1 : 0);
