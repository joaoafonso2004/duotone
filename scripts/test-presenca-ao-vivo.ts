/**
 * A presença dos amigos pelo Realtime Presence (11/11): o que se declara, como
 * se lê o que chega do canal (de outra pessoa: só campos conhecidos), os vários
 * aparelhos da mesma conta, e a conversão para a forma da tabela. E o encaixe:
 * quem publica só escreve na tabela quando faz falta; quem lê põe o canal por
 * cima da tabela, e larga os canais com o iPhone escondido.
 *
 * Correr: node --experimental-strip-types scripts/test-presenca-ao-vivo.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  estadoParaDeclarar, juntarAparelhos, lerEstadoAoVivo, presencaDoEstado, topicoDaPresenca,
} from '../src/lib/estadoDaPresencaAoVivo.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const faixa = { source: 'youtube', sourceId: 'abc', title: 'Song', artist: 'Artist', artworkUrl: 'https://i.ytimg.com/vi/abc/mqdefault.jpg', durationSeconds: 200 };

console.log('\no que se declara e o que se lê');
caso('o tópico é um por pessoa', () => assert.equal(topicoDaPresenca('u1'), 'presenca:u1'));
caso('declara-se só o que os amigos precisam, e a duração do motor quando falta', () => {
  const e = estadoParaDeclarar({ ativo: true, faixa: { ...faixa, durationSeconds: null }, duracaoMs: 181_400, positionMs: 12_345.6, rate: 1, aSeguir: [], em: 1000 });
  assert.equal(e.faixa?.durationSeconds, 181);
  assert.equal(e.faixa?.positionMs, 12_346);
  assert.deepEqual(Object.keys(e.faixa!).sort(), ['aSeguir', 'artist', 'artworkUrl', 'durationSeconds', 'positionMs', 'rate', 'source', 'sourceId', 'title']);
  assert.equal(estadoParaDeclarar({ ativo: false, faixa: null, duracaoMs: 0, positionMs: 0, rate: 1, aSeguir: [], em: 1 }).faixa, null);
});
caso('o que chega do canal é de outra pessoa: só campos conhecidos, com limites', () => {
  assert.equal(lerEstadoAoVivo(null), null);
  assert.equal(lerEstadoAoVivo({ v: 2, ativo: true, faixa: null, em: 1 }), null, 'outra versão do formato');
  assert.equal(lerEstadoAoVivo({ v: 1, ativo: 'sim', faixa: null, em: 1 }), null);
  assert.equal(lerEstadoAoVivo({ v: 1, ativo: true, faixa: { ...faixa, source: 'ficheiro' }, em: 1 }), null, 'fonte desconhecida');
  const e = lerEstadoAoVivo({ v: 1, ativo: true, em: 5, faixa: { ...faixa, positionMs: -3, rate: 99, extra: 'x', aSeguir: [faixa, { lixo: 1 }, faixa, faixa, faixa, faixa, faixa] } })!;
  assert.equal(e.faixa?.positionMs, 0, 'posição inválida fica a zero');
  assert.equal(e.faixa?.rate, 1, 'velocidade fora dos limites fica 1');
  assert.equal((e.faixa as any).extra, undefined, 'campos estranhos ficam de fora');
  assert.equal(e.faixa?.aSeguir?.length, 4, 'até cinco próximas, sem as inválidas');
});

console.log('\nos aparelhos da mesma conta');
caso('online se algum estiver; a música do que mudou por último', () => {
  const pc = { v: 1, ativo: true, faixa: null, em: 100 };
  const iphone = { v: 1, ativo: false, faixa: { ...faixa, sourceId: 'iphone' }, em: 90 };
  const velho = { v: 1, ativo: false, faixa: { ...faixa, sourceId: 'velho' }, em: 50 };
  const e = juntarAparelhos([pc, iphone, velho, { lixo: true }])!;
  assert.equal(e.ativo, true);
  assert.equal(e.faixa?.sourceId, 'iphone');
  assert.equal(juntarAparelhos([]), null, 'sem aparelhos: saiu');
  assert.equal(juntarAparelhos([{ v: 9 }]), null);
});

console.log('\nna forma da tabela');
caso('no canal: online e a tocar com validades longe; saiu: offline já, com a última música', () => {
  const agora = Date.parse('2026-11-11T15:00:00Z');
  const p = presencaDoEstado('u1', lerEstadoAoVivo({ v: 1, ativo: true, faixa: { ...faixa, positionMs: 1000, rate: 1, aSeguir: [] }, em: agora - 2000 }), agora);
  assert.ok(Date.parse(p.online_until!) > agora + 3_600_000);
  assert.ok(Date.parse(p.playing_until!) > agora + 3_600_000);
  assert.equal(p.currently_playing?.sourceId, 'abc');
  assert.equal((p.currently_playing as any).updatedAt, new Date(agora - 2000).toISOString(), 'a posição é a da hora em que foi declarada');
  const parado = presencaDoEstado('u1', lerEstadoAoVivo({ v: 1, ativo: false, faixa: null, em: agora }), agora);
  assert.ok(Date.parse(parado.online_until!) < agora, 'em segundo plano não conta como online');
  assert.equal(parado.playing_until, null);
  const saiu = presencaDoEstado('u1', null, agora, p);
  assert.ok(Date.parse(saiu.online_until!) < agora);
  assert.equal(saiu.playing_until, null);
  assert.equal(saiu.currently_playing?.sourceId, 'abc', 'a última música fica (sem estar a tocar)');
  assert.equal(saiu.last_seen_at, new Date(agora).toISOString());
});

console.log('\no encaixe');
caso('quem publica: primeiro o canal; a tabela só quando faz falta, e ao sair', () => {
  const p = ler('src/lib/presenceSync.ts');
  assert.match(p, /const presencaAoVivo = declararPresencaAoVivo\(userId, sessao\);/);
  assert.match(p, /presencaAoVivo\.declarar\(estadoParaDeclarar\(\{\n\s+ativo,\n\s+faixa: privada \? null : faixa,/, 'a escuta privada não vai no canal');
  assert.match(p, /const basePodeEsperar = !encerrar && presencaAoVivo\.aoVivo\(\) && !!ultimoNaBase\n\s+&& agora - ultimoNaBase\.em < batimentoMs - 60_000\n\s+&& ultimoNaBase\.ativo === ativo && ultimoNaBase\.privada === privada;/);
  assert.match(p, /ultimoNaBase = \{ em: agora, ativo: ativo && !encerrar, privada \};/);
  assert.match(p, /const fecharPresenca = presencaAoVivo\.parar\(\);\n\s+await publicar\(true\);/, 'sair sai do canal e escreve na tabela');
});
caso('quem lê: o canal por cima da tabela, os amigos aceites, e larga com o iPhone escondido', () => {
  const s = ler('src/state/social.ts');
  assert.match(s, /presencasAoVivo\?\.atualizar\(rawFriends\.filter\(\(f\) => f\.status === 'accepted'\)\.map\(\(f\) => f\.friendId\)\)/);
  assert.match(s, /if \(!guardarPresenca\(presencaDoEstado\(id, estado, agoraNoServidor\(\), presences\[id\]\), true\)\) return;/);
  assert.match(s, /if \(estado === 'background' && ouvintesDaPresenca\.size === 0\) presencasAoVivo\?\.pausar\(\);\n\s+else if \(estado === 'active'\) presencasAoVivo\?\.retomar\(\);/);
  assert.match(s, /presencasAoVivo\?\.parar\(\);\n\s+presencasAoVivo = null;/, 'sair da conta larga os canais');
});
caso('os canais: privados; uma recusa (sem o SQL) larga tudo e espera meia hora', () => {
  const c = ler('src/lib/presencaAoVivo.ts');
  assert.match(c, /supabase\.channel\(topicoDaPresenca\(userId\), \{ config: \{ private: true, presence: \{ key: chave \} \} \}\)/);
  assert.match(c, /supabase\.channel\(topicoDaPresenca\(id\), \{ config: \{ private: true, presence: \{ enabled: true \} \} \}\)/);
  assert.match(c, /const ESPERA_SEM_AUTORIZACAO_MS = 30 \* 60_000;/);
  assert.match(c, /else if \(vistos\.has\(id\)\) receber\(id, null\);/, 'só dá como saído quem esteve no canal (as versões antigas ficam pela tabela)');
  assert.match(c, /export const MAXIMO_DE_CANAIS_DE_AMIGOS = 40;/);
});

if (falhas) { console.error(`\n${falhas} caso(s) falharam.`); process.exit(1); }
console.log('\nTodos os casos passaram.');
