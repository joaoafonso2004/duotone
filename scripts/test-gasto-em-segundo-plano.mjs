// O que deixou de correr com o iPhone em segundo plano (1/10). Os ecrãs e a
// store não abrem em Node puro, por isso prende-se a forma no próprio código:
// se uma destas regras sair, o iPhone volta a gastar com o ecrã desligado.
//
// Correr: node scripts/test-gasto-em-segundo-plano.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// 1. O canal social sai em segundo plano no iPhone (as presenças de todos os
//    amigos chegavam com o ecrã desligado), menos a quem segue um amigo.
const social = ler('src/state/social.ts');
assert.match(social, /if \(Platform\.OS === 'web' \|\| gen !== generation\) return;/, 'o PC fica com o canal (avisos na barra de tarefas)');
assert.match(social, /estado === 'background' && channel && ouvintesDaPresenca\.size === 0/, 'sai em segundo plano, se ninguém segue um amigo');
assert.match(social, /void aSair\.then\(\(\) => \{/, 'só volta a ligar depois de o anterior sair');

// 2. A sessão do leitor grava-se de 30 em 30 s em segundo plano.
const leitor = ler('src/state/player.ts');
assert.match(leitor, /emSegundoPlano\(\) \? ESCRITA_EM_SEGUNDO_PLANO_MS : ESCRITA_A_FRENTE_MS/);
assert.match(ler('App.tsx'), /definirEmSegundoPlano\(\(\) => AppState\.currentState === 'background'\);/);

// 3. O batimento do handoff só leva a fila quando ela muda.
const sessoes = ler('src/api/playerSessions.ts');
assert.match(sessoes, /\.\.\.\(filaIgual \? \{\} : \{ queue: trimmed\.queue, queue_index: trimmed\.queueIndex \}\)/);
assert.match(sessoes, /export async function deleteOwnSession\(\): Promise<void> \{\r?\n  filaNoServidor = null;/, 'apagar a linha obriga a mandar a fila outra vez');

// 4. O vigia do arranque travado desliga-se quando a faixa arrancou.
const vigia = ler('src/hooks/useArranqueTravado.ts');
assert.match(vigia, /if \(p\.positionMs >= ARRANCOU_MS && \(doMotor == null \|\| doMotor >= ARRANCOU_MS\)\) \{ desarmar\(\); return; \}/);
assert.match(vigia, /if \(!vigia && s\.current\?\.sourceId === faixa && s\.positionMs < 1000\) armar\(\);/, 'e volta ao 0, volta a vigiar');

// 5. O widget saiu (1/10, pedido do João: não funcionava).
assert.doesNotMatch(ler('App.tsx'), /useEstadoDoWidget/);
assert.doesNotMatch(ler('app.json'), /apple-targets|application-groups/);

console.log('Gasto em segundo plano: canal social, sessão, handoff, vigia e widget passaram.');
