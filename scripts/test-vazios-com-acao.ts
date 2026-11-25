/**
 * Os vazios com uma ação (25/11, item 14 do plano de melhorias): o `EmptyState`
 * do iPhone aceita `acoes` (a primeira principal, a segunda discreta, no máximo
 * duas), e os vazios que só diziam o que faltava dizem para onde ir.
 *
 * Correr: node --experimental-strip-types scripts/test-vazios-com-acao.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

caso('o EmptyState desenha até duas ações, a primeira principal', () => {
  const v = ler('src/components/EmptyState.tsx');
  assert.match(v, /acoes\?: \{ rotulo: string; aoTocar: \(\) => void \}\[\];/);
  assert.match(v, /acoes\.slice\(0, 2\)/);
  assert.match(v, /variant=\{i === 0 \? 'primary' : 'ghost'\}/);
});

caso('cada vazio leva para onde faz sentido, pelos destinos', () => {
  const casos: [string, RegExp][] = [
    ['src/screens/DownloadsScreen.tsx', /rotulo: 'Open Liked Songs', aoTocar: \(\) => irPara\(\{ tipo: 'gostadas' \}\)[\s\S]*rotulo: 'Browse playlists', aoTocar: \(\) => irPara\(\{ tipo: 'playlists' \}\)/],
    ['src/screens/AlbunsGuardadosScreen.tsx', /rotulo: 'Find new releases', aoTocar: \(\) => irPara\(\{ tipo: 'inicio' \}\)/],
    ['src/screens/PlaylistDetailScreen.tsx', /acoes=\{canEdit \? \[\{ rotulo: 'Find songs to add'/],
    ['src/screens/ListeningStatsScreen.tsx', /rotulo: 'Play your Daily mix', aoTocar: \(\) => irPara\(\{ tipo: 'mistura-do-dia' \}\)/],
  ];
  for (const [f, re] of casos) {
    const s = ler(f);
    assert.match(s, re, f);
    assert.match(s, /const \{ irPara \} = useDestinos\(\);/, `${f}: os destinos, não navegações à mão`);
  }
});

caso('os botões novos têm francês', () => {
  const fr = ler('src/i18n/fr.ts');
  for (const k of ['Open Liked Songs', 'Browse playlists', 'Find new releases', 'Find songs to add', 'Play your Daily mix']) {
    assert.ok(fr.includes(`"${k}":`), `falta "${k}"`);
  }
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
