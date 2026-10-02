/**
 * O menu do botão direito num amigo da lateral do PC (2/10): que linhas
 * aparecem em cada situação, onde abre, e que cada linha tem quem a execute
 * no componente -- "tudo funcional do menu" (João).
 */
import { readFileSync } from 'node:fs';
import { faixaDoAmigo, opcoesDoMenuDoAmigo, posicaoDoMenu, type SituacaoDoAmigo } from '../src/lib/menuDoAmigo.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};
const ids = (s: SituacaoDoAmigo) => opcoesDoMenuDoAmigo(s).map((l) => l.id).join(',');

const base: SituacaoDoAmigo = {
  nome: 'raton', faixa: { titulo: 'deaf note' }, temJam: false, faixaGuardada: false,
  estouNumJam: false, tenhoFaixa: true, fixado: false,
};

console.log('\nas linhas');
check('a ouvir: a música dele primeiro, depois a conversa, depois a lateral',
  ids(base) === 'ouvir,tocar,fila,gostar,mensagem,perfil,mistura,jam,partilhar,fixar,remover', ids(base));
check('sem música dele: nada da música', ids({ ...base, faixa: null }) === 'mensagem,perfil,mistura,jam,partilhar,fixar,remover');
check('sem nada a tocar aqui: não há o que mandar', !ids({ ...base, tenhoFaixa: false }).includes('partilhar'));

const linhas = opcoesDoMenuDoAmigo(base);
const de = (id: string, s = base) => opcoesDoMenuDoAmigo(s).find((l) => l.id === id)!;
check('com Jam aberto, "ouvir" é entrar no Jam dele', de('ouvir', { ...base, temJam: true }).rotulo === "Join raton's Jam");
check('sem Jam, é ouvir com ele', de('ouvir').rotulo === 'Listen along with raton');
check('guardada: o coração tira', de('gostar', { ...base, faixaGuardada: true }).rotulo === 'Remove from Liked Songs');
check('por guardar: o coração guarda', de('gostar').rotulo === 'Add to Liked Songs');
check('num Jam: convida para o teu', de('jam', { ...base, estouNumJam: true }).rotulo === 'Invite to your Jam');
check('fora de um Jam: abre um com ele', de('jam').rotulo === 'Start a Jam with raton');
check('fixado: desafixa', de('fixar', { ...base, fixado: true }).rotulo === 'Unpin from sidebar');
check('só "remover" é perigoso', linhas.filter((l) => l.perigo).map((l) => l.id).join() === 'remover');
check('a primeira linha nunca leva separador', !linhas[0].inicioDeGrupo && !opcoesDoMenuDoAmigo({ ...base, faixa: null })[0].inicioDeGrupo);
check('três grupos com a música dele', linhas.filter((l) => l.inicioDeGrupo).length === 2);
check('os nomes são em inglês e sem repetidos', new Set(linhas.map((l) => l.rotulo)).size === linhas.length);

console.log('\ncada linha faz alguma coisa');
const componente = readFileSync(new URL('../src/desktop/MenuDoAmigo.web.tsx', import.meta.url), 'utf8');
const todas = new Set([...opcoesDoMenuDoAmigo(base), ...opcoesDoMenuDoAmigo({ ...base, temJam: true, faixaGuardada: true, estouNumJam: true, fixado: true })].map((l) => l.id));
for (const id of todas) check(`"${id}" tem um case no MenuDoAmigo`, componente.includes(`case '${id}'`));
check('o menu abre na lateral (onContextMenu)', readFileSync(new URL('../src/desktop/AmigosNaLateral.web.tsx', import.meta.url), 'utf8').includes('onContextMenu'));

console.log('\nonde abre');
const janela = { largura: 1280, altura: 800 };
const menu = { largura: 280, altura: 420 };
const p1 = posicaoDoMenu({ x: 100, y: 100 }, menu, janela);
check('com espaço: no rato', p1.x === 100 && p1.y === 100, JSON.stringify(p1));
const p2 = posicaoDoMenu({ x: 100, y: 700 }, menu, janela);
check('perto do fundo: para cima do rato', p2.y === 280, JSON.stringify(p2));
const p3 = posicaoDoMenu({ x: 1200, y: 100 }, menu, janela);
check('perto da direita: para a esquerda', p3.x === 920, JSON.stringify(p3));
const p4 = posicaoDoMenu({ x: 100, y: 300 }, { largura: 280, altura: 900 }, janela);
check('maior do que a janela: fica preso à folga de cima', p4.y === 8, JSON.stringify(p4));
for (const rato of [{ x: 0, y: 0 }, { x: 1280, y: 800 }, { x: 640, y: 799 }]) {
  const p = posicaoDoMenu(rato, menu, janela);
  check(`sempre dentro da janela (${rato.x},${rato.y})`, p.x >= 8 && p.y >= 8 && p.x + 280 <= 1272 && p.y + 420 <= 792, JSON.stringify(p));
}

console.log('\na música dele como faixa');
const f = faixaDoAmigo({ source: 'youtube', sourceId: 'abc', title: 'deaf note', artist: 'Playboi Carti', artworkUrl: null, durationSeconds: 140, positionMs: 3000 } as any);
check('só os campos de uma faixa', !!f && !('positionMs' in f) && f.sourceId === 'abc' && f.album === null && !('id' in f), JSON.stringify(f));
check('com id quando a presença o traz', faixaDoAmigo({ id: 't1', source: 'youtube', sourceId: 'a', title: 'x', artist: null, artworkUrl: null, durationSeconds: null })?.id === 't1');
check('sem sourceId não há faixa', faixaDoAmigo({ source: 'youtube', sourceId: '', title: 'x', artist: null, artworkUrl: null, durationSeconds: null }) === null);
check('sem nada não há faixa', faixaDoAmigo(null) === null);

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
