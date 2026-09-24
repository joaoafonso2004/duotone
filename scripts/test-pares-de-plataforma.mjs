/**
 * Um ficheiro com versão para o PC (`x.web.tsx`) e outra para o iPhone tem de
 * usar a MESMA extensão nas duas (`x.tsx`). O Metro procura extensão a
 * extensão -- primeiro `.web.ts` e `.ts`, depois `.web.tsx` e `.tsx` -- e um
 * `x.ts` ganha a um `x.web.tsx` também na build do PC, sem erro nenhum.
 *
 * Foi o que aconteceu à 3.8.1 do Windows (24/9): `src/janelaMini.ts` +
 * `src/janelaMini.web.tsx`, e a janela do mini leitor abriu a app inteira.
 *
 * Correr: node scripts/test-pares-de-plataforma.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const EXTENSOES = ['ts', 'tsx', 'js', 'jsx'];
const PLATAFORMAS = ['web', 'ios', 'android', 'native'];

function ficheiros(pasta) {
  const saida = [];
  for (const e of fs.readdirSync(pasta, { withFileTypes: true })) {
    const p = path.join(pasta, e.name);
    if (e.isDirectory()) saida.push(...ficheiros(p));
    else saida.push(p);
  }
  return saida;
}

const todos = new Set([...ficheiros('src'), 'index.ts', 'App.tsx'].map((f) => f.replace(/\\/g, '/')));
const errados = [];
for (const f of todos) {
  const m = /^(.*)\.(web|ios|android|native)\.(ts|tsx|js|jsx)$/.exec(f);
  if (!m) continue;
  const [, base, , ext] = m;
  for (const outra of EXTENSOES) {
    if (outra === ext) continue;
    if (todos.has(`${base}.${outra}`)) errados.push(`${f} ao lado de ${base}.${outra}`);
    for (const pl of PLATAFORMAS) {
      if (todos.has(`${base}.${pl}.${outra}`)) errados.push(`${f} ao lado de ${base}.${pl}.${outra}`);
    }
  }
}

assert.deepEqual(errados, [], `extensões diferentes no mesmo par (o Metro escolhe o errado): ${errados.join('; ')}`);
console.log(`Pares de plataforma: ${todos.size} ficheiros, extensões iguais em todos os pares.`);
