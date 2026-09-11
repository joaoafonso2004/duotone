/**
 * Os menus de uma faixa, iguais em todo o lado -- src/lib/menuDaFaixa.ts.
 *
 * Correr: node --experimental-strip-types scripts/test-menu-da-faixa.ts
 */
import assert from 'node:assert/strict';
import { menuDaFaixa, MOTIVOS, ORDEM, type ContextoDoMenu, type IdDaAcao } from '../src/lib/menuDaFaixa.ts';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok - ${nome}`); }
  catch (e) { falhas++; console.error(`  FALHOU - ${nome}\n    ${(e as Error).message}`); }
}

const base: ContextoDoMenu = {
  plataforma: 'ios', onde: 'lista', semRede: false, tocaSemRede: false,
  guardada: false, podeDescarregar: true, descarregada: false, temArtista: true,
};
const menu = (over: Partial<ContextoDoMenu> = {}) => menuDaFaixa({ ...base, ...over });
const ids = (over: Partial<ContextoDoMenu> = {}) => menu(over).map((a) => a.id);
const achar = (id: IdDaAcao, over: Partial<ContextoDoMenu> = {}) => {
  const a = menu(over).find((x) => x.id === id);
  if (!a) throw new Error(`"${id}" não está no menu`);
  return a;
};

/** Todos os sítios onde há um menu de faixa, com o que cada um tem de contexto. */
const SITIOS: [string, Partial<ContextoDoMenu>][] = [
  ['listas do iPhone', {}],
  ['playlist do iPhone', { playlist: { podeEditar: true } }],
  ['leitor do iPhone', { onde: 'leitor' }],
  ['fila do iPhone', { onde: 'fila', fila: { emJam: false, mudou: false } }],
  ['PC, clique direito e "…"', { plataforma: 'pc', podeDescarregar: false }],
  ['playlist do PC', { plataforma: 'pc', podeDescarregar: false, playlist: { podeEditar: true } }],
  ['fila do PC', { plataforma: 'pc', podeDescarregar: false, onde: 'fila', fila: { emJam: false, mudou: false } }],
];

console.log('\na mesma coisa em todo o lado');
caso('cada ação tem o mesmo nome e o mesmo ícone em todos os sítios', () => {
  const visto = new Map<string, string>();
  for (const [sitio, over] of SITIOS) {
    for (const a of menu(over)) {
      const chave = `${a.id}|${over.guardada ?? base.guardada}`;
      const nome = `${a.rotulo} · ${a.icone}`;
      if (visto.has(chave)) assert.equal(nome, visto.get(chave), `${a.id} em ${sitio}`);
      else visto.set(chave, nome);
    }
  }
});
caso('e pela mesma ordem em todos os sítios', () => {
  for (const [sitio, over] of SITIOS) {
    const posicoes = ids(over).map((id) => ORDEM.indexOf(id));
    assert.deepEqual(posicoes, [...posicoes].sort((a, b) => a - b), sitio);
  }
});
caso('as ações comuns estão em todos os menus de lista, do iPhone e do PC', () => {
  const comuns: IdDaAcao[] = ['tocar-agora', 'tocar-a-seguir', 'por-na-fila', 'guardar', 'por-em-playlist', 'ver-artista', 'partilhar', 'recomendacoes'];
  for (const plataforma of ['ios', 'pc'] as const) {
    const tem = ids({ plataforma });
    for (const id of comuns) assert.ok(tem.includes(id), `${id} no ${plataforma}`);
  }
});
caso('o PC ganha o "Play next" que não tinha', () => {
  assert.ok(ids({ plataforma: 'pc' }).includes('tocar-a-seguir'));
});
caso('nada em português, e nenhum rótulo repetido num menu', () => {
  const PT = /[ãõçáéíóúâêô]|partilhar|adicionar|remover|tocar|guardar|amigo|fila\b/i;
  for (const [sitio, over] of SITIOS) {
    const rotulos = menu(over).map((a) => a.rotulo);
    for (const r of rotulos) assert.ok(!PT.test(r), `"${r}" em ${sitio}`);
    assert.equal(new Set(rotulos).size, rotulos.length, sitio);
  }
  for (const m of Object.values(MOTIVOS)) assert.ok(!PT.test(m), `motivo "${m}"`);
});

console.log('\no que não se aplica não aparece');
caso('no leitor não há "Play now", "Play next" nem "Add to queue"', () => {
  const tem = ids({ onde: 'leitor' });
  for (const id of ['tocar-agora', 'tocar-a-seguir', 'por-na-fila'] as IdDaAcao[]) assert.ok(!tem.includes(id), id);
  assert.ok(tem.includes('guardar') && tem.includes('partilhar'));
});
caso('na fila não há "Play next" nem "Add to queue" (já lá está)', () => {
  const tem = ids({ onde: 'fila', fila: { emJam: false, mudou: false } });
  assert.ok(tem.includes('tocar-agora'));
  assert.ok(!tem.includes('tocar-a-seguir') && !tem.includes('por-na-fila'));
  assert.equal(tem[tem.length - 1], 'tirar-da-fila');
});
caso('no PC não há download, e no iPhone só nas do YouTube', () => {
  assert.ok(!ids({ plataforma: 'pc', podeDescarregar: false }).includes('descarregar'));
  assert.ok(!ids({ plataforma: 'pc', podeDescarregar: true }).includes('descarregar'), 'nem que alguém se engane no contexto');
  assert.ok(ids({ podeDescarregar: true }).includes('descarregar'));
  assert.ok(!ids({ podeDescarregar: false }).includes('descarregar'));
});
caso('tirar da playlist só dentro de uma playlist, e no fim', () => {
  assert.ok(!ids().includes('tirar-da-playlist'));
  const tem = ids({ playlist: { podeEditar: true } });
  assert.equal(tem[tem.length - 1], 'tirar-da-playlist');
  assert.equal(achar('tirar-da-playlist', { playlist: { podeEditar: true } }).destrutiva, true);
});

console.log('\no que não se pode fazer agora fica à vista, a dizer porquê');
caso('sem rede o menu tem as mesmas ações', () => {
  for (const [sitio, over] of SITIOS) {
    assert.deepEqual(ids({ ...over, semRede: true }), ids(over), sitio);
  }
});
caso('sem rede, o que precisa dela diz "Needs internet"', () => {
  for (const id of ['guardar', 'por-em-playlist', 'partilhar', 'recomendacoes', 'descarregar'] as IdDaAcao[]) {
    assert.equal(achar(id, { semRede: true }).indisponivel, MOTIVOS.semRede, id);
  }
});
caso('sem rede toca-se o que está descarregado, e o resto diz porquê', () => {
  assert.equal(achar('tocar-agora', { semRede: true, tocaSemRede: true }).indisponivel, null);
  assert.equal(achar('tocar-a-seguir', { semRede: true, tocaSemRede: false }).indisponivel, MOTIVOS.naoDescarregada);
  assert.equal(achar('por-na-fila', { plataforma: 'pc', podeDescarregar: false, semRede: true }).indisponivel, MOTIVOS.semRede);
});
caso('sem rede o artista e tirar um download continuam a funcionar', () => {
  assert.equal(achar('ver-artista', { semRede: true }).indisponivel, null);
  assert.equal(achar('descarregar', { semRede: true, descarregada: true }).indisponivel, null);
});
caso('dentro de um Jam, tirar da fila fica à vista e diz porquê', () => {
  const a = achar('tirar-da-fila', { onde: 'fila', fila: { emJam: true, mudou: false } });
  assert.equal(a.indisponivel, MOTIVOS.filaDoJam);
});
caso('uma fila que mudou por baixo do menu não deixa tirar a errada', () => {
  assert.equal(achar('tirar-da-fila', { onde: 'fila', fila: { emJam: false, mudou: true } }).indisponivel, MOTIVOS.filaMudou);
  assert.equal(achar('tirar-da-fila', { onde: 'fila', fila: { emJam: false, mudou: false } }).indisponivel, null);
});
caso('numa playlist que não é tua, tirar diz que só o dono pode', () => {
  assert.equal(achar('tirar-da-playlist', { playlist: { podeEditar: false } }).indisponivel, MOTIVOS.soODono);
});
caso('sem artista conhecido o "View artist" diz porquê', () => {
  assert.equal(achar('ver-artista', { temArtista: false }).indisponivel, MOTIVOS.semArtista);
});

console.log('\no guardar diz o que vai fazer');
caso('guardada diz "Remove from library", por guardar diz "Save to library"', () => {
  assert.equal(achar('guardar', { guardada: true }).rotulo, 'Remove from library');
  assert.equal(achar('guardar', { guardada: false }).rotulo, 'Save to library');
});
caso('enquanto não se sabe, não se adivinha', () => {
  const a = achar('guardar', { guardada: null });
  assert.equal(a.indisponivel, MOTIVOS.aVerificar);
});
caso('o download diz o que vai fazer', () => {
  assert.equal(achar('descarregar', { descarregada: false }).rotulo, 'Download');
  assert.equal(achar('descarregar', { descarregada: true }).rotulo, 'Remove download');
});

if (falhas) {
  console.error(`\n  ${falhas} caso(s) falharam.\n`);
  process.exit(1);
}
console.log('\n  Todos os casos passaram.\n');
