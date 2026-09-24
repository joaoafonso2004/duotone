import {
  acrescentarPendente, depoisDoEnvio, lerPendentes, MAX_PENDENTES, MAX_TENTATIVAS, novaEscutaPendente, proximoLote,
} from '../src/lib/escutasPendentes.ts';

let mau = 0;
const eq = (rotulo: string, veio: unknown, esperado: unknown) => {
  const ok = JSON.stringify(veio) === JSON.stringify(esperado);
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${ok ? '' : `  -> esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`}`);
};

const faixa = (id: string) => ({ source: 'youtube', sourceId: id, title: `T ${id}`, artist: 'A', album: null, artworkUrl: null, durationSeconds: 200 } as any);
const t0 = new Date('2026-09-24T10:00:00Z');
const aos = (min: number) => new Date(t0.getTime() + min * 60_000);
const e = (id: string, min: number) => novaEscutaPendente(faixa(id), aos(min), aos(min - 2));

console.log('\nguardar');
const a = e('a', 0), b = e('b', 4), a2 = e('a', 8);
let lista = acrescentarPendente(acrescentarPendente(acrescentarPendente([], a), b), a2);
eq('a mesma faixa ouvida duas vezes são duas escutas', lista.length, 3);
eq('a mesma escuta não entra duas vezes', acrescentarPendente(lista, a).length, 3);
eq('guarda a hora da escuta e a do início', [a.em, a.comecouEm], ['2026-09-24T10:00:00.000Z', '2026-09-24T09:58:00.000Z']);
let cheia: any[] = [];
for (let i = 0; i < MAX_PENDENTES + 5; i++) cheia = acrescentarPendente(cheia, e(`x${i}`, i));
eq('acima do teto sai a mais antiga', [cheia.length, cheia[0].faixa.sourceId], [MAX_PENDENTES, 'x5']);

console.log('\nenviar');
const lote = proximoLote(lista, 2);
eq('o lote vai pela ordem da escuta', lote.map((x) => x.faixa.sourceId), ['a', 'b']);
const entretanto = acrescentarPendente(lista, e('c', 12));
eq('um envio que correu tira o lote, e só o lote (a escuta nova fica)',
  depoisDoEnvio(entretanto, lote, true).map((x) => x.faixa.sourceId), ['a', 'c']);
const falhou = depoisDoEnvio(lista, lote, false);
eq('um envio que falhou deixa tudo e conta a tentativa', falhou.map((x) => x.tentativas), [1, 1, 0]);
let teimosa = [e('z', 0)];
for (let i = 0; i < MAX_TENTATIVAS; i++) teimosa = depoisDoEnvio(teimosa, teimosa, false);
eq('ao fim de tantas falhas a escuta sai, para não travar as outras', teimosa.length, 0);

console.log('\nler do disco');
eq('o que foi gravado volta igual', lerPendentes(JSON.stringify(lista)), lista);
eq('lixo não rebenta', lerPendentes('{partido'), []);
eq('linhas sem forma ficam de fora', lerPendentes(JSON.stringify([{ id: 1 }, a])).length, 1);
eq('nada guardado', lerPendentes(null), []);

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
