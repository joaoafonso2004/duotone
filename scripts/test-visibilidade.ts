import { avisoDaTroca, visibilidade, type EntradaDaVisibilidade } from '../src/lib/visibilidade.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

const base: EntradaDaVisibilidade = { emJam: false, pessoasNoJam: 0, privada: false, discord: false };
const v = (over: Partial<EntradaDaVisibilidade>) => visibilidade({ ...base, ...over });

console.log('-- quem vê o que está a tocar --');
check('de origem, os amigos', v({}).estado === 'amigos' && v({}).rotulo === 'Friends');
check('com o Discord ligado, amigos e Discord', v({ discord: true }).estado === 'discord');
check('a privada ganha ao Discord', v({ discord: true, privada: true }).estado === 'privada');
// O caso que obriga à ordem: um amigo entra num Jam sem convite, e a escuta
// privada não fecha isso. Dizer "Private" ali era mentir.
check('o Jam ganha à privada', v({ emJam: true, pessoasNoJam: 2, privada: true }).estado === 'jam');
check('o Jam ganha ao Discord', v({ emJam: true, pessoasNoJam: 2, discord: true }).estado === 'jam');

console.log('\n-- o que o rótulo diz --');
check('Jam com gente conta as pessoas', v({ emJam: true, pessoasNoJam: 3 }).rotulo === 'Jam · 3', v({ emJam: true, pessoasNoJam: 3 }).rotulo);
check('Jam sozinho não mostra um 1', v({ emJam: true, pessoasNoJam: 1 }).rotulo === 'Jam');
check('Jam sem membros lidos ainda não inventa números', v({ emJam: true, pessoasNoJam: 0 }).rotulo === 'Jam');
check('a frase fala dos OUTROS', v({ emJam: true, pessoasNoJam: 2 }).descricao.startsWith('In a Jam with 1 other person'));
check('a privada com Discord diz que o Discord também saiu', /Discord/.test(v({ privada: true, discord: true }).descricao));
check('a privada sem Discord não fala do Discord', !/Discord/.test(v({ privada: true }).descricao));

console.log('\n-- o que o clique faz --');
check('no Jam abre o Jam', v({ emJam: true, pessoasNoJam: 2 }).acao === 'abrirJam');
check('fora dele alterna a privada', ['amigos', 'discord', 'privada'].every((e) =>
  v({ privada: e === 'privada', discord: e === 'discord' }).acao === 'alternarPrivada'));
check('cada estado tem o seu ícone', new Set([v({}), v({ discord: true }), v({ privada: true }), v({ emJam: true })].map((x) => x.icone)).size === 4);

console.log('\n-- o aviso da troca --');
check('ligar a privada com Discord', avisoDaTroca(true, true) === 'Hidden from friends and Discord');
check('ligar a privada sem Discord', avisoDaTroca(true, false) === 'Hidden from friends');
check('desligar volta a dizer quem vê', avisoDaTroca(false, false) === 'Friends can see what’s playing');

console.log(bad ? `\n  ${bad} falha(s)` : `\n  Todos os casos passaram.`);
process.exitCode = bad ? 1 : 0;
