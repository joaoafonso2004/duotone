/**
 * O segundo catálogo — o que existe e nunca foi lançado.
 *
 * As linhas de exemplo aqui são reais, tiradas do tracker do Playboi Carti:
 * é uma folha mantida à mão por dezenas de pessoas, e inventar linhas limpas
 * para a testar seria testar outra coisa.
 */
import {
  aceitarDoYouTube, capasPorEra, faixasDoTracker, iniciaisDaEra, jaTens, porOuvir,
  procuraNoYouTube, segundosDoTempo, tituloLimpo, type FaixaDoTracker,
} from '../src/lib/tracker.ts';

let mau = 0;
const check = (rotulo: string, ok: boolean, extra = '') => {
  if (!ok) mau++;
  console.log(`  ${ok ? 'ok   ' : 'FALHA'} ${rotulo}${extra ? '  -> ' + extra : ''}`);
};
const eq = (rotulo: string, veio: unknown, esperado: unknown) =>
  check(rotulo, veio === esperado, veio === esperado ? '' : `esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(veio)}`);

console.log('\nos tempos da folha');
eq('minutos e segundos', segundosDoTempo('3:19'), 199);
eq('com horas', segundosDoTempo('1:02:03'), 3723);
eq('espaços à volta não estorvam', segundosDoTempo(' 2:44 '), 164);
eq('o que ninguém sabe vem a interrogações', segundosDoTempo('?:??'), null);
eq('um traço não é um tempo', segundosDoTempo('-'), null);
eq('vazio não é um tempo', segundosDoTempo(''), null);
eq('nem um número solto', segundosDoTempo('199'), null);
eq('nem outra coisa qualquer', segundosDoTempo(null), null);

console.log('\nos títulos');
eq('a estrela do destaque sai', tituloLimpo('⭐️ Cry'), 'Cry');
eq('a versão FICA', tituloLimpo('⭐ At The Gate [V4]'), 'At The Gate [V4]');
eq('sem estrela fica igual', tituloLimpo('Molly'), 'Molly');
eq('o que não for texto dá vazio', tituloLimpo(undefined), '');

console.log('\na resposta da aba');
// A forma exacta que o trackerapi devolve.
const resposta = {
  name: 'Playboi Carti Tracker [Official]',
  eras: [
    {
      name: 'Killing Me Softly',
      tracks: [{
        name: { raw: '⭐️ Cry\n(prod. Harry Fraud)', title: '⭐️ Cry', credits: ['(prod. Harry Fraud)'] },
        track_length: '3:19', leak_date: 'Jul 17, 2011',
        available_length: 'Full', quality: 'High Quality', type: 'High Bitrate Rip',
      }],
    },
    {
      name: 'Die Lit',
      tracks: [
        {
          name: { raw: '⭐ Texas [V1]\n(prod. Jake One & Southside)', title: '⭐ Texas [V1]', credits: ['(prod. Jake One & Southside)'] },
          track_length: '3:26', leak_date: 'Mar 5, 2021',
          available_length: 'OG File', quality: 'CD Quality', type: 'Demo',
        },
        // Uma linha estragada não pode deitar abaixo a lista toda.
        { name: { title: '   ' }, track_length: '2:00' },
      ],
    },
  ],
};

const faixas = faixasDoTracker(resposta);
eq('a linha sem título é deitada fora', faixas.length, 2);
eq('a era vem colada à faixa', faixas[0].era, 'Killing Me Softly');
eq('o título vem limpo', faixas[0].titulo, 'Cry');
eq('a duração vem em segundos', faixas[0].duracaoSegundos, 199);
eq('o produtor vem separado', faixas[0].creditos[0], '(prod. Harry Fraud)');
eq('e o resto da ficha também', faixas[1].disponibilidade, 'OG File');
eq('uma resposta vazia não rebenta', faixasDoTracker({}).length, 0);
eq('nem uma resposta que não é uma resposta', faixasDoTracker(null).length, 0);

console.log('\no que já se tem');
const t = (titulo: string, dur: number | null = null, era = 'Die Lit'): FaixaDoTracker => ({
  titulo, creditos: [], era, duracaoSegundos: dur,
  dataDoLeak: null, disponibilidade: null, qualidade: null, tipo: null,
  cor: '#620e0d', corDoTexto: '#ffffff',
});

check('o nome verdadeiro aparece dentro do lixo do YouTube',
  jaTens({ titulo: '[LEAK] Playboi Carti - Southside Freestyle (CDQ)' }, t('Southside Freestyle')));
check('e igual também conta',
  jaTens({ titulo: 'Southside Freestyle' }, t('Southside Freestyle')));
check('outra faixa não conta',
  !jaTens({ titulo: 'Playboi Carti - Magnolia' }, t('Southside Freestyle')));

// A guarda que evita o exagero: um título curto cabe dentro de meio mundo.
check('título curto sozinho não chega',
  !jaTens({ titulo: 'Carti - Cry Baby (Official Video)', duracaoSegundos: 240 }, t('Cry', 199)));
check('título curto com a duração a confirmar já chega',
  jaTens({ titulo: 'Carti - Cry Baby (Official Video)', duracaoSegundos: 201 }, t('Cry', 199)));
check('título curto sem durações não conta',
  !jaTens({ titulo: 'Carti - Cry Baby' }, t('Cry')));

console.log('\no que falta ouvir');
const doTracker = [t('Southside Freestyle'), t('Texas [V1]'), t('At The Gate [V4]')];
const minha = [{ titulo: '[LEAK] Playboi Carti - Southside Freestyle (CDQ)' }];
const falta = porOuvir(doTracker, minha);
eq('tira o que já se tem', falta.length, 2);
eq('e mantém a ordem da comunidade', falta[0].titulo, 'Texas [V1]');
eq('sem biblioteca, falta tudo', porOuvir(doTracker, []).length, 3);
eq('sem tracker, não falta nada', porOuvir([], minha).length, 0);

console.log('\no que se manda procurar');
eq('com versão, a versão chega',
  procuraNoYouTube('Playboi Carti', t('Texas [V1]')), 'Playboi Carti Texas [V1]');
eq('sem versão, junta-se a era para desambiguar',
  procuraNoYouTube('Playboi Carti', t('Cry')), 'Playboi Carti Cry Die Lit');

console.log('\nas iniciais da era');
eq('duas palavras dão duas letras', iniciaisDaEra('Die Lit'), 'DL');
eq('as de ligação não contam', iniciaisDaEra('death in tune'), 'DT');
eq('uma palavra dá as duas primeiras letras', iniciaisDaEra('Sen$ation'), 'SE');
eq('a pontuação não estorva', iniciaisDaEra('THC: The High Chronical$'), 'TH');
eq('sendo a única palavra, a de ligação vale', iniciaisDaEra('The'), 'TH');
eq('sem era, não se inventa', iniciaisDaEra(''), '?');

console.log('\nas capas de cada era');
// A ideia: as eras que SAÍRAM têm faixas tuas, e essas trazem a capa delas. As
// que nunca saíram não têm capa em lado nenhum, e ficam com a cor da era.
{
  const doTrackerComEras = [
    t('Long Time', 200, 'Die Lit'),
    t('Fell In Luv', 210, 'Die Lit'),
    t('Southside Freestyle', 163, 'death in tune'),
  ];
  const aMinha = [
    { titulo: 'Playboi Carti - Long Time (Official Audio)', duracaoSegundos: 200, capa: 'https://exemplo/die-lit.jpg' },
    { titulo: 'Playboi Carti - Southside Freestyle', duracaoSegundos: 163, capa: null },
  ];
  const capas = capasPorEra(doTrackerComEras, aMinha);
  eq('a era lançada herda a capa da tua faixa', capas.get('Die Lit'), 'https://exemplo/die-lit.jpg');
  check('a era que nunca saiu fica sem capa', !capas.has('death in tune'));
  eq('sem biblioteca não há capas', capasPorEra(doTrackerComEras, []).size, 0);
}

console.log('\na porta do que vem do YouTube');
// TODOS os exemplos abaixo saíram de procuras a sério, e os que falham eram
// resultados que o `pickBest` tinha dado como confirmados. Ver a nota em
// `aceitarDoYouTube`: ele foi feito para a importação do Spotify, onde a
// procura devolve a faixa; aqui o espaço está cheio de type beats.
check('a faixa certa passa',
  aceitarDoYouTube(t('Cry', 199), { titulo: 'Playboi Carti - Cry (Official Audio)', duracaoSegundos: 200 }));
check('um type beat com o nome do artista NÃO passa',
  !aceitarDoYouTube(t('Dream [V2]', 113), { titulo: '|FREE|Ken Carson x Destroy Lonley x Playboicarti Type beat', duracaoSegundos: 113 }));
check('nem em minúsculas e entre chavetas',
  !aceitarDoYouTube(t('Pissed Off [V2]', 136), { titulo: '{free} ken carson xperiment type beat "pissed off"', duracaoSegundos: 136 }));
check('nem um instrumental',
  !aceitarDoYouTube(t('Faster [V2]', 160), { titulo: 'Playboi Carti - Faster (Instrumental)', duracaoSegundos: 160 }));
// O caso que só a duração não apanhava: dois títulos sem uma palavra em comum.
check('outra música com a duração a calhar NÃO passa',
  !aceitarDoYouTube(t('Living Reckless [V2]', 135), { titulo: 'Playboi Carti - SOUTH ATLANTA BABY (Official Audio)', duracaoSegundos: 135 }));
check('a duração fora da tolerância não passa',
  !aceitarDoYouTube(t('Loot', 109), { titulo: 'Ken Carson - Loot', duracaoSegundos: 140 }));
check('sem duração do lado do YouTube não passa',
  !aceitarDoYouTube(t('Loot', 109), { titulo: 'Ken Carson - Loot', duracaoSegundos: null }));
check('sem duração no tracker também não',
  !aceitarDoYouTube(t('Loot', null), { titulo: 'Ken Carson - Loot', duracaoSegundos: 109 }));
// A versão vive entre parênteses rectos e o `normalizar` tira-a: `6PM [V2]`
// tem de continuar a casar com um vídeo que lhe chame só `6PM`.
check('a marca de versão não impede o encontro',
  aceitarDoYouTube(t('6PM [V2]', 136), { titulo: 'Destroy Lonely - 6PM (unreleased)', duracaoSegundos: 137 }));

console.log(mau === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${mau} caso(s) a falhar.\n`);
process.exit(mau === 0 ? 0 : 1);
