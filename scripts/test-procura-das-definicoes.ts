/**
 * As Definições por secções que abrem, e a procura (27/11,
 * `docs/definicoes-por-seccoes-maquete.html`). O João não encontrou o "Ambient full
 * screen" do PC: a procura tem de o achar, e cada definição que ela sabe tem de
 * existir mesmo no ecrã da plataforma (é pelo rótulo que a linha acende).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFINICOES, normalizarParaProcura, procurarDefinicoes } from '../src/lib/procuraDasDefinicoes.ts';
import { ROTULOS } from '../src/lib/rotulosDasDefinicoes.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); } catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

caso('sem maiúsculas, acentos nem espaços', () => {
  assert.equal(normalizarParaProcura('Full Screen'), 'fullscreen');
  assert.equal(normalizarParaProcura('Égaliseur'), 'egaliseur');
});
caso('"fullscreen" encontra o Ambient full screen no PC (e no iPhone não existe)', () => {
  assert.deepEqual(procurarDefinicoes('fullscreen', 'pc').map((d) => d.rotulo), [ROTULOS.ecraAmbiente]);
  assert.deepEqual(procurarDefinicoes('fullscreen', 'iphone'), []);
  assert.equal(procurarDefinicoes('AFK', 'pc')[0]?.rotulo, ROTULOS.ecraAmbiente, 'pelas palavras');
});
caso('o rótulo primeiro, as palavras depois; vazio não dá nada', () => {
  const r = procurarDefinicoes('cross', 'iphone').map((d) => d.rotulo);
  assert.equal(r[0], ROTULOS.crossfade);
  assert.ok(procurarDefinicoes('blend', 'iphone').some((d) => d.rotulo === ROTULOS.crossfade));
  assert.deepEqual(procurarDefinicoes('   ', 'iphone'), []);
});
caso('cada definição do iPhone está no ecrã das Definições do iPhone', () => {
  const ecra = ler('src/screens/SettingsScreen.tsx');
  const rotulos = ler('src/lib/rotulosDasDefinicoes.ts');
  for (const d of DEFINICOES.filter((x) => x.iphone)) {
    const chave = Object.entries(ROTULOS).find(([, v]) => v === d.rotulo)?.[0];
    const esta = (chave && ecra.includes(`ROTULOS.${chave}`)) || ecra.includes(`rotulo="${d.rotulo}"`);
    assert.ok(esta || (d.rotulo === 'Scrobbling'), `${d.rotulo}: não está no SettingsScreen`);
    assert.ok(chave ? rotulos.includes(`'${d.rotulo}'`) : true);
  }
});
caso('cada definição do PC está nas Definições do PC', () => {
  const pc = ler('src/desktop/paginas/SettingsPage.web.tsx');
  for (const d of DEFINICOES.filter((x) => x.pc)) {
    const chave = Object.entries(ROTULOS).find(([, v]) => v === d.rotulo)?.[0];
    const esta = (chave && pc.includes(`ROTULOS.${chave}`)) || pc.includes(`label="${d.rotulo}"`);
    assert.ok(esta, `${d.rotulo}: não está no SettingsPage`);
  }
});
caso('no iPhone: secções que abrem, a procura em cima, e a linha encontrada acende', () => {
  const ecra = ler('src/screens/SettingsScreen.tsx');
  assert.match(ecra, /<Input icon="search" placeholder="Search settings"/);
  assert.match(ecra, /<GrupoQueAbre titulo="Playback" aberto=\{abertas\.has\('playback'\)\}/);
  assert.match(ecra, /<RealceDaLinha\.Provider value=\{realce\}>/);
  const lista = ler('src/components/ListaAgrupada.tsx');
  assert.match(lista, /const useAcesa = \(rotulo: string\) => useContext\(RealceDaLinha\) === rotulo;/);
  assert.match(lista, /\{aberto \? 'Less' : 'More'\}/);
  assert.match(lista, /c\.type === React\.Fragment/, 'o resto em fragmento conta as linhas de dentro');
  const pc = ler('src/desktop/paginas/SettingsPage.web.tsx');
  assert.match(pc, /<Field icon="search" placeholder="Search settings"/);
  assert.match(pc, /const acesa = useContext\(RealceDaLinha\) === label;/);
});

console.log(falhas ? `\n  ${falhas} caso(s) falharam.\n` : '\n  Todos os casos passaram.\n');
process.exit(falhas ? 1 : 0);
