/**
 * Uma faixa mostra-se SEMPRE pelo `tituloDaFaixa` (e o artista pelo
 * `displayArtist`), nunca pelo `track.title` cru.
 *
 * O título cru é o do upload ("Juice WRLD - Make It Back (Audio)") e o
 * `artist` do YouTube é o CANAL ("Future", "sanity"). A 25/9 ainda havia uma
 * dúzia de sítios a pintá-los assim -- os Downloads do iPhone, a fila do Now
 * Playing e a barra do leitor do PC, os cartões da Pesquisa -- ao lado de
 * listas que já os limpavam. Este teste lê os ecrãs e falha se um
 * `{faixa.title}` voltar a aparecer como texto.
 *
 * Os rótulos de acessibilidade (`${track.title}`, dentro de template) não
 * contam: não se veem.
 *
 * Correr: node scripts/test-titulos-limpos.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Nomes que, nestes ecrãs, são sempre uma faixa.
const FAIXAS = new Set([
  'track', 'faixa', 'trackData', 'current', 't', 'entry', 'moment', 'trackMenu',
  'faixaDoAno', 'item', 'session.track', 'entrada.track', 'l.faixa',
]);

// Onde o título cru é o que se quer ver, ou onde `item` não é uma faixa.
const LICENCAS = new Set([
  // A importação mostra os vídeos tal como estão no YouTube, para se escolher.
  'src/screens/ImportYouTubeScreen.tsx',
  // A revisão do Spotify compara o vídeo encontrado com a faixa pedida: é o
  // título do vídeo que se está a julgar.
  'src/desktop/SpotifyReview.web.tsx',
  'src/desktop/SpotifyImportPage.web.tsx',
  // Aqui `item` é um álbum (uma playlist do YouTube).
  'src/screens/LibraryGroupScreen.tsx',
  // Aqui `item` é uma notificação.
  'src/components/NotificationBanner.tsx',
]);

function ficheiros(pasta) {
  const saida = [];
  for (const e of fs.readdirSync(pasta, { withFileTypes: true })) {
    const p = path.join(pasta, e.name);
    if (e.isDirectory()) saida.push(...ficheiros(p));
    else if (p.endsWith('.tsx')) saida.push(p.replace(/\\/g, '/'));
  }
  return saida;
}

const errados = [];
for (const f of ficheiros('src')) {
  if (LICENCAS.has(f)) continue;
  const linhas = fs.readFileSync(f, 'utf8').split('\n');
  linhas.forEach((linha, i) => {
    // `{x.title}` que NÃO seja `${x.title}` de um template.
    for (const m of linha.matchAll(/(?<!\$)\{\s*([\w.!]+?)!?\.title\s*\}/g)) {
      const base = m[1].replace(/!/g, '');
      const ultimo = base.split('.').slice(-2).join('.');
      if (FAIXAS.has(base) || FAIXAS.has(ultimo) || FAIXAS.has(base.split('.').pop())) {
        errados.push(`${f}:${i + 1}  ${linha.trim().slice(0, 120)}`);
      }
    }
  });
}

assert.deepEqual(errados, [], `Título cru de uma faixa no ecrã -- usar tituloDaFaixa():\n${errados.join('\n')}`);
console.log('test-titulos-limpos: ok');
