/**
 * A gaveta da Home (6.0.4): o modelo, a primeira gaveta, a edição e a grelha.
 */
import { isDeepStrictEqual } from 'node:util';
import {
  apagarEspaco, arrumar, ativar, chaveDaPeca, espacoAtivo, gavetaInicial, juntar, lerGaveta, MAXIMO_DE_ESPACOS,
  MAXIMO_DE_PECAS, novoEspaco, proximaVelocidade, proximoTamanho, proximoTemporizador, renomear, rotuloDaVelocidade,
  TAMANHOS, temPeca, tirar, trocar, type Gaveta, type Peca,
  CENAS_PRONTAS, lerCena, mudarCena, proximaEscolha, resumoDaCena,
  ARRANQUES_A_MOSTRAR, lerMemoriaDaDescoberta, oQueMostrar,
} from '../src/lib/gaveta.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};

console.log('\na primeira gaveta');
{
  const g = gavetaInicial({
    recentes: [
      { tipo: 'playlist', nome: 'Noites', id: 'p1', capas: ['a', 'b', 'c', 'd', 'e'] },
      { tipo: 'artista', nome: 'Isak', capas: ['x'] },
      { tipo: 'guardadas', nome: 'Liked Songs', capas: [] },
    ],
    amigos: [{ id: 'u1', nome: 'Rita', avatar: null }],
    temPc: true,
  });
  const ps = espacoAtivo(g).pecas;
  check('abre num espaço Everyday', g.espacos.length === 1 && espacoAtivo(g).nome === 'Everyday');
  check('começa pelo que está a tocar, a toda a largura', ps[0]?.tipo === 'agora' && ps[0].tamanho === '4x2');
  check('o artista que mais se reabre', ps.some((p) => p.tipo === 'origem' && p.origem.tipo === 'artista' && p.origem.nome === 'Isak'));
  check('a lista mais recente (a playlist, não o artista)', ps.some((p) => p.tipo === 'origem' && p.origem.id === 'p1'));
  check('guarda no máximo quatro capas', ps.every((p) => p.tipo !== 'origem' || p.origem.capas.length <= 4));
  check('um amigo, o temporizador, a escuta privada e o PC',
    ['amigo:u1', 'controlo:temporizador', 'controlo:privado', 'pc'].every((k) => ps.some((p) => chaveDaPeca(p) === k)));
  const vazia = gavetaInicial({ recentes: [], amigos: [], temPc: false });
  check('sem nada no aparelho, nasce na mesma com o essencial e sem o PC',
    espacoAtivo(vazia).pecas.map((p) => p.tipo).join() === 'agora,controlo,controlo');
}

console.log('\nler o que está guardado');
{
  const g = gavetaInicial({ recentes: [{ tipo: 'artista', nome: 'Isak', capas: [] }], amigos: [], temPc: false });
  check('o que se grava lê-se igual', isDeepStrictEqual(lerGaveta(JSON.parse(JSON.stringify(g))), g));
  check('nada guardado: faz-se a primeira', lerGaveta(null) === null && lerGaveta({}) === null && lerGaveta({ espacos: [] }) === null);
  const estragada = lerGaveta({
    ativo: 'nao-existe',
    espacos: [
      { id: 'a', nome: '  Car  ', pecas: [
        { id: '1', tipo: 'controlo', controlo: 'temporizador', tamanho: '1x1' },
        { id: '2', tipo: 'controlo', controlo: 'temporizador', tamanho: '2x1' },
        { id: '3', tipo: 'controlo', controlo: 'teletransporte', tamanho: '1x1' },
        { id: '4', tipo: 'origem', origem: { tipo: 'playlist', nome: 'Sem id', capas: [] }, tamanho: '2x2' },
        { id: '5', tipo: 'agora', tamanho: '9x9' },
        { id: '6', tipo: 'cena-de-uma-versao-futura' },
        'lixo',
      ] },
      { id: 'a', nome: 'Repetido', pecas: [] },
    ],
  });
  const ps = estragada ? espacoAtivo(estragada).pecas : [];
  check('o ativo que não existe passa ao primeiro', estragada?.ativo === 'a');
  check('o espaço repetido sai, o nome fica limpo', estragada?.espacos.length === 1 && estragada.espacos[0]!.nome === 'Car');
  check('o controlo repetido, o desconhecido e a playlist sem id ficam de fora', ps.map((p) => p.id).join() === '1,5');
  check('um tamanho que o tipo não tem volta ao de nascença', ps.find((p) => p.id === '5')?.tamanho === '4x2');
  const muitos = lerGaveta({ espacos: Array.from({ length: 9 }, (_, i) => ({ id: `e${i}`, nome: `E${i}`, pecas: [] })) });
  check(`no máximo ${MAXIMO_DE_ESPACOS} espaços`, muitos?.espacos.length === MAXIMO_DE_ESPACOS);
}

console.log('\neditar');
{
  let g: Gaveta = gavetaInicial({ recentes: [{ tipo: 'artista', nome: 'Isak', capas: [] }], amigos: [], temPc: false });
  const e = g.ativo;
  const ids = () => espacoAtivo(g).pecas.map((p) => p.id);
  const [a, b] = ids();
  g = trocar(g, e, a!, b!);
  check('duas peças trocam de sítio', ids()[0] === b && ids()[1] === a);
  const antes = espacoAtivo(g).pecas.find((p) => p.tipo === 'agora')!;
  g = proximoTamanho(g, e, antes.id);
  check('o ⤢ passa ao tamanho seguinte', espacoAtivo(g).pecas.find((p) => p.id === antes.id)?.tamanho === TAMANHOS.agora[1]);
  g = proximoTamanho(g, e, antes.id);
  check('e depois do último volta ao primeiro', espacoAtivo(g).pecas.find((p) => p.id === antes.id)?.tamanho === TAMANHOS.agora[0]);
  const r = juntar(g, e, { tipo: 'controlo', controlo: 'velocidade' });
  check('uma peça nova entra no fim, no tamanho de nascença', r.motivo === null
    && espacoAtivo(r.gaveta).pecas.at(-1)?.tipo === 'controlo' && espacoAtivo(r.gaveta).pecas.at(-1)?.tamanho === '1x1');
  g = r.gaveta;
  check('a mesma peça não entra duas vezes no mesmo espaço', juntar(g, e, { tipo: 'controlo', controlo: 'velocidade' }).motivo === 'repetida');
  check('e a folha sabe que já lá está', temPeca(espacoAtivo(g), { tipo: 'controlo', controlo: 'velocidade' }));
  const idsAntes = new Set(ids());
  const outra = juntar(g, e, { tipo: 'atalho', atalho: 'downloads' });
  check('o id da peça nova não repete nenhum', !idsAntes.has(espacoAtivo(outra.gaveta).pecas.at(-1)!.id));
  const sem = tirar(g, e, ids()[0]!);
  check('× tira a peça', espacoAtivo(sem).pecas.length === ids().length - 1);
  let cheia: Gaveta = { espacos: [{ id: 'x', nome: 'X', pecas: [] }], ativo: 'x' };
  for (let i = 0; i < MAXIMO_DE_PECAS; i++) {
    cheia = juntar(cheia, 'x', { tipo: 'amigo', amigoId: `u${i}`, nome: `U${i}`, avatar: null }).gaveta;
  }
  check(`no máximo ${MAXIMO_DE_PECAS} peças por espaço`,
    juntar(cheia, 'x', { tipo: 'pc' }).motivo === 'cheia' && espacoAtivo(cheia).pecas.length === MAXIMO_DE_PECAS);
}

console.log('\nespaços');
{
  let g: Gaveta = gavetaInicial({ recentes: [], amigos: [], temPc: false });
  const novo = novoEspaco(g, 'Car');
  check('um espaço novo nasce vazio e já ativo', !!novo && espacoAtivo(novo).nome === 'Car' && espacoAtivo(novo).pecas.length === 0);
  g = novo!;
  check('sem nome, chama-se pelo número', espacoAtivo(novoEspaco(g, '  ')!).nome === 'Space 3');
  g = renomear(g, g.ativo, ' Gym ');
  check('renomear', espacoAtivo(g).nome === 'Gym');
  check('mudar de espaço', ativar(g, 'everyday').ativo === 'everyday' && ativar(g, 'nao-existe').ativo === g.ativo);
  g = apagarEspaco(g, g.ativo);
  check('apagar o ativo volta ao primeiro', g.espacos.length === 1 && g.ativo === 'everyday');
  check('o último espaço nunca sai', apagarEspaco(g, 'everyday').espacos.length === 1);
  let muitos: Gaveta | null = g;
  for (let i = 0; i < 10 && muitos; i++) { const n = novoEspaco(muitos, `E${i}`); if (!n) break; muitos = n; }
  check(`no máximo ${MAXIMO_DE_ESPACOS} espaços`, muitos!.espacos.length === MAXIMO_DE_ESPACOS && novoEspaco(muitos!, 'mais') === null);
}

console.log('\nos controlos num toque');
{
  const passo = (r: number, fim = false) => JSON.stringify(proximoTemporizador(r, fim));
  check('desligado passa a 15 min', passo(0) === '{"minutos":15}');
  check('a contar 15, passa a 30', passo(14 * 60) === '{"minutos":30}');
  check('a contar 30, passa a 1 h', passo(29 * 60) === '{"minutos":60}');
  check('a contar 1 h, passa ao fim da música', passo(59 * 60) === '{"fimDaFaixa":true}');
  check('no fim da música, desliga', passo(0, true) === '{"desligar":true}');
  check('a velocidade dá a volta', [1, 1.1, 1.25, 1.5, 0.9].map(proximaVelocidade).join() === '1.1,1.25,1.5,0.9,1');
  check('uma velocidade fora do ciclo volta ao normal', proximaVelocidade(1.37) === 1);
  check('e escreve-se como no leitor', rotuloDaVelocidade(1) === '1×' && rotuloDaVelocidade(1.25) === '1.25×');
}

console.log('\ncenas');
{
  check('as cenas prontas passam pela validação tal e qual', CENAS_PRONTAS.every((c) => isDeepStrictEqual(lerCena(JSON.parse(JSON.stringify(c))), c)));
  const lida = lerCena({ id: 'x', nome: '  Gym  ', icone: 'foguete', definicoes: { privado: 'sim', temporizador: 9999, velocidade: 1.1, shuffle: 'aos-saltos', raio: true } });
  check('uma cena estragada fica só com o que se reconhece', isDeepStrictEqual(lida, { id: 'x', nome: 'Gym', icone: 'faisca', definicoes: { velocidade: 1.1 } }));
  check('sem id ou nome não há cena', lerCena({ nome: 'X' }) === null && lerCena({ id: 'x' }) === null);
  check('o resumo da Night', resumoDaCena(CENAS_PRONTAS[0]!.definicoes).join(' · ') === 'Private on · Sleep in 30 min');
  check('o resumo diz a hora, o fim da música e o desligado',
    resumoDaCena({ temporizador: 60 })[0] === 'Sleep in 1 h' && resumoDaCena({ temporizador: 'fim' })[0] === 'Sleep at the end of the song'
    && resumoDaCena({ temporizador: 0 })[0] === 'Sleep timer off');
  check('e a velocidade e o shuffle', resumoDaCena({ velocidade: 1.25, shuffle: 'inteligente' }).join() === 'Speed 1.25×,Smart shuffle');
  check('o editor percorre as escolhas e volta a "deixar como está"',
    [undefined, true, false].map((v) => proximaEscolha('privado', v as never)).join() === 'true,false,'
    && proximaEscolha('temporizador', 'fim') === 0 && proximaEscolha('temporizador', 0) === undefined);
  let g: Gaveta = { espacos: [{ id: 'e', nome: 'E', pecas: [] }], ativo: 'e' };
  g = juntar(g, 'e', { tipo: 'cena', cena: CENAS_PRONTAS[0]! }).gaveta;
  check('uma cena entra como peça de 2x1', espacoAtivo(g).pecas[0]?.tipo === 'cena' && espacoAtivo(g).pecas[0]?.tamanho === '2x1');
  check('a mesma cena não entra duas vezes', juntar(g, 'e', { tipo: 'cena', cena: CENAS_PRONTAS[0]! }).motivo === 'repetida');
  const peca = espacoAtivo(g).pecas[0]!;
  g = mudarCena(g, 'e', peca.id, { ...CENAS_PRONTAS[0]!, nome: 'Late night', definicoes: { privado: true } });
  const nova = espacoAtivo(g).pecas[0]!;
  check('o editor troca a cena da peça', nova.tipo === 'cena' && nova.cena.nome === 'Late night' && !('temporizador' in nova.cena.definicoes));
  check('e ela grava-se e lê-se igual', isDeepStrictEqual(lerGaveta(JSON.parse(JSON.stringify(g))), g));
}

console.log('\ndescobrir a gaveta');
{
  const m = (vista: boolean, arranques: number, empurrada: boolean) => JSON.stringify(oQueMostrar({ vista, arranques, empurrada }));
  check('no primeiro arranque: a linha de luz e o empurrão', m(false, 1, false) === '{"costura":true,"empurrar":true}');
  check('o empurrão só uma vez', m(false, 2, true) === '{"costura":true,"empurrar":false}');
  check('depois de a abrir, nada', m(true, 2, true) === '{"costura":false,"empurrar":false}');
  check(`ao fim de ${ARRANQUES_A_MOSTRAR} aberturas da app deixa de pedir`, m(false, ARRANQUES_A_MOSTRAR + 1, false) === '{"costura":false,"empurrar":false}');
  check('o que vem estragado do disco começa do zero', JSON.stringify(lerMemoriaDaDescoberta('lixo')) === '{"vista":false,"arranques":0,"empurrada":false}');
}

console.log('\na grelha');
{
  const p = (id: string, tamanho: Peca['tamanho']): Peca => ({ id, tipo: 'agora', tamanho });
  const { lugares, linhas } = arrumar([p('a', '4x2'), p('b', '2x2'), p('c', '2x1'), p('d', '1x1'), p('e', '1x1'), p('f', '4x1')]);
  const em = (id: string) => lugares.find((l) => l.id === id)!;
  check('a larga ocupa as duas primeiras linhas', em('a').coluna === 0 && em('a').linha === 0);
  check('a média fica à esquerda, por baixo', em('b').coluna === 0 && em('b').linha === 2);
  check('a de 2x1 vai para o lado da média', em('c').coluna === 2 && em('c').linha === 2);
  check('as pequenas enchem o resto do lado (sem buraco)', em('d').coluna === 2 && em('d').linha === 3 && em('e').coluna === 3 && em('e').linha === 3);
  check('a de largura inteira começa numa linha nova', em('f').coluna === 0 && em('f').linha === 4);
  check('a grelha tem cinco linhas', linhas === 5);
  const densa = arrumar([p('a', '1x1'), p('b', '4x1'), p('c', '1x1')]);
  check('uma pequena depois de uma larga volta ao buraco de cima', densa.lugares.find((l) => l.id === 'c')!.linha === 0);
  check('nada se sobrepõe', (() => {
    const vistos = new Set<string>();
    for (const l of lugares) for (let y = l.linha; y < l.linha + l.linhas; y++) for (let x = l.coluna; x < l.coluna + l.colunas; x++) {
      const k = `${x},${y}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
    }
    return true;
  })());
}

if (mau) {
  console.error(`\n${mau} falha(s)`);
  process.exit(1);
}
console.log('\ntudo ok');
