/**
 * O About de uma música no iPhone, com o andamento e a tonalidade (26/11, item 22 do
 * plano): só nas músicas que o AutoMix já mediu (o que ele guardou no aparelho), e
 * aberto pelas reticências ("About this song").
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { andamentoDaFaixa, NOTAS, periodoDaBatida, textoDaTonalidade } from '../src/lib/andamentoDaFaixa.ts';
import type { Ritmo } from '../src/lib/ritmo.ts';
import { FR } from '../src/i18n/fr.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const janela = (bpm: number, confianca: number, tom?: Ritmo['tom']): Ritmo =>
  ({ bpm, periodoS: 60 / bpm, confianca, temposFortesS: [], somS: 0, ...(tom ? { tom } : {}) });

caso('sem medida, nada (as linhas não aparecem)', () => {
  assert.deepEqual(andamentoDaFaixa(null), { bpm: null, tom: null });
  assert.deepEqual(andamentoDaFaixa({ inicio: null, fim: null }), { bpm: null, tom: null });
});

caso('o andamento: o do início com batida segura, senão o do fim; arredondado', () => {
  assert.equal(andamentoDaFaixa({ inicio: janela(123.6, 3.4), fim: janela(90, 4) }).bpm, 124);
  assert.equal(andamentoDaFaixa({ inicio: janela(123.6, 1.2), fim: janela(90.2, 4) }).bpm, 90, 'o início sem batida clara');
  assert.equal(andamentoDaFaixa({ inicio: janela(120, 1.1), fim: janela(120, 1.3) }).bpm, null, 'nenhuma clara');
});

caso('a tonalidade: a mais confiante das duas, acima do limiar do AutoMix', () => {
  const am = { tonica: 9, menor: true, confianca: 0.8 }, c = { tonica: 0, menor: false, confianca: 0.7 };
  assert.deepEqual(andamentoDaFaixa({ inicio: janela(120, 4, c), fim: janela(120, 4, am) }).tom, am);
  assert.equal(andamentoDaFaixa({ inicio: janela(120, 4, { tonica: 2, menor: false, confianca: 0.4 }), fim: null }).tom, null, 'pouco clara não conta');
});

caso('"A minor · 8A", "C major · 8B" e o ritmo do ponto', () => {
  assert.equal(NOTAS.length, 12);
  assert.equal(textoDaTonalidade({ tonica: 9, menor: true, confianca: 1 }), 'A minor · 8A');
  assert.equal(textoDaTonalidade({ tonica: 0, menor: false, confianca: 1 }), 'C major · 8B');
  assert.equal(textoDaTonalidade({ tonica: 7, menor: false, confianca: 1 }), 'G major · 9B');
  assert.equal(periodoDaBatida(124), 484, 'a maquete: 0,484 s a 124 BPM');
});

caso('pelas reticências, no leitor e nas listas; e só pede o que o PC já pede', () => {
  const folha = ler('src/components/FolhaSobreAMusica.tsx');
  assert.match(folha, /titulo="About this song"/);
  assert.match(folha, /if \(medida\.bpm\) linhas\.push\(\{ rotulo: 'Tempo'/);
  assert.match(folha, /if \(medida\.tom\) linhas\.push\(\{ rotulo: 'Key'/);
  assert.match(folha, /ritmoGuardado\(track\.sourceId\)/);
  // 28/11: com o que o PC mostra, do mesmo hook (no pior caso uma leitura do
  // yt_cache por artista novo e por aparelho, a da página do artista). Nada direto.
  assert.doesNotMatch(folha, /supabase|useVizinhancaDoArtista|analisarRitmo/, 'nada a mais do que o hook do PC; não analisa nada');
  assert.match(folha, /const d = useSobreAMusica\(track\);/);
  // Só com a folha aberta (e até ela sair): vive montada no leitor e no menu das listas.
  assert.match(folha, /\{montado && faixa \? \(/);
  assert.match(folha, /const t = setTimeout\(\(\) => setMontado\(false\), 450\);/);
  assert.ok(folha.indexOf('useSobreAMusica(track)') > folha.indexOf('function Conteudo('), 'o hook só no conteúdo');
  assert.doesNotMatch(folha, /setInterval\(/);
  assert.match(ler('src/components/PlayerRoot.tsx'), /case 'sobre': fecharEEntao\(\(\) => setSobreAberto\(true\)\); return;/);
  assert.match(ler('src/components/PlayerRoot.tsx'), /<FolhaSobreAMusica visible=\{sobreAberto\} track=\{current\}/);
  assert.match(ler('src/components/TrackActionsSheet.tsx'), /case 'sobre': setParaSobre\(t\); return;/);
});

caso('os textos novos em francês', () => {
  for (const t of ['About this song', 'Key', '{0} minor', '{0} major']) assert.ok(FR[t], t);
});

caso('o About do iPhone com o que o PC mostra (28/11)', () => {
  const folha = ler('src/components/FolhaSobreAMusica.tsx');
  // A música: o álbum, o ano, as escutas e o refrão (saltar para ele só na que toca).
  assert.match(folha, /if \(d\.ano\) linhas\.push\(\{ rotulo: 'Released'/);
  assert.match(folha, /if \(d\.refraoS != null\) linhas\.push\(\{\n\s+rotulo: 'Chorus'/);
  assert.match(folha, /depois: aTocarEsta \? \(/);
  // O artista, "You and …", o último lançamento, as mais ouvidas e os parecidos.
  for (const t of ['>Artist<', '`You and ${d.nome}`', '>Latest release<', '>Your most played of theirs<', '>Fans also like<']) {
    assert.ok(folha.includes(t), t);
  }
  assert.match(folha, /useArtistasFavoritos\.getState\(\)\.alternar\(d\.chave\)/, 'a estrela dos favoritos');
  assert.match(folha, /if \(usePlayer\.getState\(\)\.expanded\) usePlayer\.getState\(\)\.setExpanded\(false\);\n\s+irParaNoIphone\(\{ tipo: 'artista', nome \}\);/, 'fecha o leitor antes de ir ao artista');
  assert.doesNotMatch(folha, /borderRadius: 999|PillButton/, 'os parecidos em texto, sem pílulas');
  for (const t of ['Play from here', 'plays of theirs', 'songs in your library', '{0} plays', 'Add to your favourite artists', 'Go to artist, {0}']) assert.ok(FR[t], t);
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
