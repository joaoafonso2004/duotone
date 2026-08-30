import {
  classificar,
  consolidar,
  sinalDoErro,
  historico,
  limparHistorico,
  mensagem,
  recuperacao,
  registar,
  relatorio,
  resumo,
  rotulo,
  type TipoFalha,
} from '../src/lib/playbackDiagnostics.ts';

let bad = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (!cond) bad++;
  console.log(`  ${cond ? 'ok   ' : 'FALHA'} ${label}${extra ? '  -> ' + extra : ''}`);
};

console.log('\nclassificacao a partir de sinais estruturados');
check('rede em baixo ganha a tudo o resto',
  classificar({ offline: true, codigoEmbed: 150, statusPlayability: 'UNPLAYABLE' }) === 'sem-rede');
check('http 0 e falta de rede', classificar({ http: 0 }) === 'sem-rede');
check('101 e embed proibido', classificar({ codigoEmbed: 101 }) === 'embed-bloqueado');
check('150 e embed proibido', classificar({ codigoEmbed: 150 }) === 'embed-bloqueado');
check('100 e indisponivel', classificar({ codigoEmbed: 100 }) === 'indisponivel');
check('2 (id invalido) e indisponivel', classificar({ codigoEmbed: 2 }) === 'indisponivel');
check('5 nao diz nada, fica desconhecido', classificar({ codigoEmbed: 5 }) === 'desconhecido');
check('UNPLAYABLE e indisponivel', classificar({ statusPlayability: 'UNPLAYABLE' }) === 'indisponivel');
check('AGE_VERIFICATION_REQUIRED e idade',
  classificar({ statusPlayability: 'AGE_VERIFICATION_REQUIRED' }) === 'restrito-idade');
check('LOGIN_REQUIRED sem pistas e bloqueio de bot',
  classificar({ statusPlayability: 'LOGIN_REQUIRED' }) === 'bloqueio-bot');
check('LOGIN_REQUIRED com razao de idade e idade',
  classificar({ statusPlayability: 'LOGIN_REQUIRED', mensagem: 'Sign in to confirm your age' }) === 'restrito-idade');
check('403 e bloqueio de bot', classificar({ http: 403 }) === 'bloqueio-bot');
check('429 e bloqueio de bot', classificar({ http: 429 }) === 'bloqueio-bot');
check('404 e indisponivel', classificar({ http: 404 }) === 'indisponivel');
check('503 e o CDN a recusar', classificar({ http: 503 }) === 'cdn-recusou');
check('OK explicito nao e falha estruturada, cai no texto',
  classificar({ statusPlayability: 'OK', mensagem: 'No AVPlayer-compatible stream found' }) === 'sem-formato');

console.log('\no sinal estruturado ganha sempre ao texto');
// A regressao que motivou tudo isto: a mensagem esta em ingles e diz uma
// coisa, o status diz outra. Manda o status.
check('status vence mensagem enganadora',
  classificar({ statusPlayability: 'AGE_VERIFICATION_REQUIRED', mensagem: 'video unavailable' }) === 'restrito-idade');
check('codigo do embed vence mensagem',
  classificar({ codigoEmbed: 150, mensagem: 'private video' }) === 'embed-bloqueado');

console.log('\ntexto localizado — o bug original');
// Era isto que a regex antiga (/not playable|unavailable|private|removed/i)
// deixava passar: com a app em portugues nao apanhava nada e a falha ia parar
// a "problema de rede".
check('"Vídeo privado" (PT) e indisponivel',
  classificar({ mensagem: 'Vídeo privado' }) === 'indisponivel');
check('"Este vídeo foi removido" (PT) e indisponivel',
  classificar({ mensagem: 'Este vídeo foi removido pelo utilizador' }) === 'indisponivel');
check('"Não disponível no teu país" (PT) e regiao',
  classificar({ mensagem: 'Não disponível no teu país' }) === 'restrito-regiao');
check('"restrição de idade" (PT) e idade',
  classificar({ mensagem: 'Tem restrição de idade' }) === 'restrito-idade');
check('"Sem ligação à internet" (PT) e falta de rede',
  classificar({ mensagem: 'Sem ligacao a internet (e esta faixa nao esta descarregada)' }) === 'sem-rede');
check('ingles continua a funcionar',
  classificar({ mensagem: 'This video is private' }) === 'indisponivel');
check('nada reconhecivel fica desconhecido',
  classificar({ mensagem: 'algo completamente novo' }) === 'desconhecido');

console.log('\nrecuperacao');
check('sem rede NAO salta a faixa', recuperacao('sem-rede').saltar === false);
check('sem rede nao tenta embed', recuperacao('sem-rede').embed === false);
check('indisponivel procura outra copia', recuperacao('indisponivel').alternativa === true);
check('embed bloqueado procura outra copia', recuperacao('embed-bloqueado').alternativa === true);
check('bloqueio de bot vai ao embed', recuperacao('bloqueio-bot').embed === true);
check('bloqueio de bot NAO salta', recuperacao('bloqueio-bot').saltar === false);
check('idade salta e nao procura copia',
  recuperacao('restrito-idade').saltar === true && recuperacao('restrito-idade').alternativa === false);
check('sem formato vai ao embed', recuperacao('sem-formato').embed === true);

console.log('\nsinal a partir do Error do resolver');
const erroComStatus: any = new Error('Video indisponivel');
erroComStatus.statusPlayability = 'AGE_VERIFICATION_REQUIRED';
check('le o statusPlayability pendurado no Error',
  classificar(sinalDoErro(erroComStatus)) === 'restrito-idade');
const erroComHttp: any = new Error('CDN rejected the URL (HTTP 403)');
erroComHttp.http = 403;
check('le o http pendurado no Error', classificar(sinalDoErro(erroComHttp)) === 'bloqueio-bot');
check('erro simples cai no texto', classificar(sinalDoErro(new Error('video privado'))) === 'indisponivel');
check('extra sobrepoe-se ao Error',
  classificar(sinalDoErro(new Error('seja o que for'), { offline: true })) === 'sem-rede');
check('null nao rebenta', classificar(sinalDoErro(null)) === 'desconhecido');

console.log('\nconsolidar o veredito da cascata');
check('sem sinais e desconhecido', consolidar([]) === 'desconhecido');
check('todos sem rede -> sem rede', consolidar(['sem-rede', 'sem-rede', 'sem-rede']) === 'sem-rede');
// Um cliente sem rede no meio de outros que dizem algo concreto e ruido,
// nao o veredito.
check('um sem-rede no meio nao manda',
  consolidar(['sem-rede', 'bloqueio-bot', 'bloqueio-bot']) === 'bloqueio-bot');
// Falha do VIDEO ganha a falha de TRANSPORTE: se um cliente ja soube que o
// video esta removido, nenhum outro caminho o ressuscita.
check('indisponivel ganha a bloqueio-bot',
  consolidar(['bloqueio-bot', 'indisponivel', 'cdn-recusou']) === 'indisponivel');
check('idade ganha a indisponivel', consolidar(['indisponivel', 'restrito-idade']) === 'restrito-idade');
check('bloqueio-bot ganha a cdn-recusou', consolidar(['cdn-recusou', 'bloqueio-bot']) === 'bloqueio-bot');
check('so desconhecidos ficam desconhecidos', consolidar(['desconhecido', 'desconhecido']) === 'desconhecido');
// A consequencia pratica: quatro 403 mandam a app ao embed, quatro
// UNPLAYABLE mandam-na saltar. Sao caminhos opostos.
check('quatro 403 -> embed, nao saltar',
  recuperacao(consolidar(['bloqueio-bot', 'bloqueio-bot', 'bloqueio-bot', 'bloqueio-bot'])).embed === true);
check('quatro UNPLAYABLE -> saltar, nao embed',
  recuperacao(consolidar(['indisponivel', 'indisponivel', 'indisponivel', 'indisponivel'])).saltar === true);

console.log('\nmensagens ao utilizador');
const TIPOS: TipoFalha[] = ['sem-rede', 'indisponivel', 'embed-bloqueado', 'restrito-idade',
  'restrito-regiao', 'bloqueio-bot', 'sem-formato', 'cdn-recusou', 'tempo-esgotado', 'desconhecido'];
let limpas = true;
let curtas = true;
for (const t of TIPOS) {
  const m = mensagem(t);
  // Nada de build id, nome de cliente InnerTube, PO Token ou codigos HTTP.
  if (/build |client=|pot=|ANDROID|IOS_|http \d|\[|\]/i.test(m)) { limpas = false; console.log('    suja:', t, m); }
  if (m.length > 64) { curtas = false; console.log('    longa:', t, m.length); }
}
check('nenhuma mensagem tem jargao tecnico', limpas);
check('todas cabem na barra do leitor (<= 64 chars)', curtas);
check('ha uma mensagem por tipo', TIPOS.every((t) => mensagem(t).length > 0));

console.log('\nnomes legiveis dos tipos');
// Os identificadores (`bloqueio-bot`, `indisponivel`) sao internos e estavam a
// vazar para as Definicoes como se fossem texto.
check('cada tipo tem nome legivel',
  TIPOS.every((t) => rotulo(t).length > 0 && rotulo(t) !== t));
// Nao se pode proibir o hifen: "age-restricted" e uma palavra, nao um
// identificador. O que interessa e que nenhum rotulo SEJA um identificador.
check('nenhum rotulo e um identificador',
  TIPOS.every((t) => !TIPOS.includes(rotulo(t) as any)),
  TIPOS.map(rotulo).filter((r) => TIPOS.includes(r as any)).join());
check('os nomes sao todos diferentes', new Set(TIPOS.map(rotulo)).size === TIPOS.length);

console.log('\nregisto e relatorio');
limparHistorico();
check('comeca vazio', historico().length === 0);
const base = Date.UTC(2026, 7, 29, 14, 30, 0);
registar({ quando: base, videoId: 'aaa', titulo: 'Um', fase: 'resolver', tipo: 'bloqueio-bot', detalhe: 'client=IOS pot=no' });
registar({ quando: base + 1000, videoId: 'bbb', titulo: 'Dois', fase: 'embed', tipo: 'indisponivel', detalhe: 'code=100' });
registar({ quando: base + 2000, videoId: 'ccc', titulo: 'Tres', fase: 'resolver', tipo: 'bloqueio-bot', detalhe: 'http=403' });
check('guarda os tres', historico().length === 3);
const r = resumo();
check('resume por tipo', r['bloqueio-bot'] === 2 && r['indisponivel'] === 1, JSON.stringify(r));

const texto = relatorio({ versao: '1.4.1', build: 'abc123', plataforma: 'ios', gerado: '2026-08-29T14:31:00Z' });
check('o relatorio TEM o detalhe tecnico', texto.includes('client=IOS pot=no') && texto.includes('http=403'));
check('o relatorio tem o build', texto.includes('abc123'));
check('o relatorio conta as falhas', texto.includes('2x throttled by YouTube'));
// O identificador interno fica no relatorio (serve para mim), mas acompanhado
// do nome legivel — na UI so aparece o nome.
check('e mantem o identificador ao lado', texto.includes('(bloqueio-bot)'));
check('o relatorio poe os eventos por ordem',
  texto.indexOf('aaa') < texto.indexOf('bbb') && texto.indexOf('bbb') < texto.indexOf('ccc'));
check('as horas sao legiveis', texto.includes('14:30:00'));

limparHistorico();
check('relatorio vazio nao mente',
  relatorio({ versao: '1', build: 'b', plataforma: 'web', gerado: 'x' }).includes('No failures recorded'));

// O anel nao pode crescer sem fim: a app fica horas aberta.
for (let i = 0; i < 200; i++) {
  registar({ quando: base + i, videoId: `v${i}`, titulo: 't', fase: 'resolver', tipo: 'desconhecido', detalhe: '' });
}
check('o anel tem teto', historico().length === 60, String(historico().length));
check('guarda os MAIS RECENTES', historico()[historico().length - 1].videoId === 'v199');
limparHistorico();

console.log(bad === 0 ? '\n  Todos os casos passaram.\n' : `\n  ${bad} caso(s) a falhar.\n`);
process.exit(bad === 0 ? 0 : 1);
