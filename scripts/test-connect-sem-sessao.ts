// O Duotone Connect só escuta ordens com conta (lib/connectSync.ts, 28/9).
//
// Sem sessão, o ecrã de login lia os `pedidos_ao_aparelho` de 20 em 20 s (~180
// pedidos por hora, sempre vazios pela RLS -- egress) e chamava o
// `limpar_pedidos_ao_aparelho`, que levava 401, a cada abertura. Medido no
// browser antes da correção: 3 s, 23 s, 43 s, 63 s, 83 s...
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Sem os \r: no Windows (e no runner da build de Windows) o checkout vem em CRLF.
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const connect = ler('src/lib/connectSync.ts');
const corpo = connect.slice(connect.indexOf('export function useComandosDoAparelho'));
const fim = corpo.indexOf('\n}\n');
const hook = corpo.slice(0, fim);

assert.match(hook, /^export function useComandosDoAparelho\(userId: string \| null \| undefined\): void/,
  'o hook recebe a conta');
assert.match(hook, /useEffect\(\(\) => \{\s*if \(!userId\) return;/,
  'sem conta não abre o Realtime, não limpa, não varre');
assert.match(hook, /\}, \[userId\]\);$/, 'mudar de conta recomeça a escuta');
// O arranque continua a ser o primeiro varrimento: abrir a app (ou entrar)
// não pode pôr música a tocar -- ver `podeExecutarNoArranque`.
assert.match(hook, /let primeiro = true;/);

assert.match(ler('App.tsx'), /useComandosDoAparelho\(userId\);/, 'o App passa a conta');

console.log('Connect sem sessão: passou.');
