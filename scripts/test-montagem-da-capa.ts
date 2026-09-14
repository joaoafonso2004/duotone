// A capa 3D a montar-se com o download, os dois presos e o relatório.
// Ver src/lib/montagemDaCapa.ts e src/lib/relatorioDoArranque.ts.
import assert from 'node:assert/strict';
import {
  alvosDasPecas, bocadosPrevistos, estadoPreso, faseDoArranque, NAO_COMECOU_MS, PRESO_A_MEIO_MS,
  type LeituraDoDownload,
} from '../src/lib/montagemDaCapa.ts';
import { montarRelatorioDoArranque, type EntradaDoRelatorio } from '../src/lib/relatorioDoArranque.ts';

const MB = 1048576;
const download = (bocados: number, totalBocados: number, extra: Partial<NonNullable<LeituraDoDownload>> = {}): LeituraDoDownload => ({
  fase: 'a-descarregar', bocados, total: totalBocados * MB, bocadoBytes: MB, inicioEm: 0, ultimoBocadoEm: null, ...extra,
});

// --- a fase ---
assert.equal(faseDoArranque({ emDiscoAoComecar: true, pronta: false, download: null }), 'em-disco');
assert.equal(faseDoArranque({ emDiscoAoComecar: false, pronta: true, download: download(1, 3) }), 'pronta');
assert.equal(faseDoArranque({ emDiscoAoComecar: false, pronta: false, download: null }), 'a-preparar');
assert.equal(faseDoArranque({ emDiscoAoComecar: false, pronta: false, download: download(0, 3, { fase: 'na-fila' }) }), 'a-preparar',
  'na fila ainda não é download: é o "não começou"');
assert.equal(faseDoArranque({ emDiscoAoComecar: false, pronta: false, download: download(0, 3) }), 'a-descarregar');

// --- os presos ---
assert.equal(estadoPreso({ fase: 'a-preparar', agora: NAO_COMECOU_MS - 1, pedidoEm: 0, download: null }), null);
assert.equal(estadoPreso({ fase: 'a-preparar', agora: NAO_COMECOU_MS, pedidoEm: 0, download: null }), 'nao-comecou');
assert.equal(estadoPreso({ fase: 'a-descarregar', agora: 20000, pedidoEm: 0, download: download(1, 3, { ultimoBocadoEm: 20000 - PRESO_A_MEIO_MS + 1 }) }), null,
  'conta desde o último bocado, não desde o pedido');
assert.equal(estadoPreso({ fase: 'a-descarregar', agora: 20000, pedidoEm: 0, download: download(1, 3, { ultimoBocadoEm: 20000 - PRESO_A_MEIO_MS }) }), 'preso-a-meio');
assert.equal(estadoPreso({ fase: 'a-descarregar', agora: 9000, pedidoEm: 0, download: download(0, 3, { inicioEm: 9000 - PRESO_A_MEIO_MS }) }), 'preso-a-meio',
  'sem bocado nenhum, conta desde que o download começou');
assert.equal(estadoPreso({ fase: 'pronta', agora: 99999, pedidoEm: 0, download: null }), null);
assert.equal(estadoPreso({ fase: 'em-disco', agora: 99999, pedidoEm: 0, download: null }), null);

// --- as peças: cada bocado avança a caixa, e nada volta atrás ---
assert.equal(bocadosPrevistos(download(0, 3)), 3);
assert.equal(bocadosPrevistos(null), 0);
for (const total of [1, 2, 3, 4, 5, 9]) {
  const estados = [];
  for (let k = 0; k < total; k++) estados.push(alvosDasPecas('a-descarregar', download(k, total)));
  estados.push(alvosDasPecas('pronta', null));
  const valor = (a: { encaixada: boolean; passo: number; visivel: boolean }) => (a.encaixada ? 1 : a.visivel ? a.passo : 0);
  for (let k = 1; k < estados.length; k++) {
    const antes = estados[k - 1].map(valor), agora = estados[k].map(valor);
    agora.forEach((v, i) => assert.ok(v >= antes[i], `${total} bocados: a peça ${i} não volta atrás no passo ${k}`));
    assert.notDeepEqual(agora, antes, `${total} bocados: o passo ${k} mexe na caixa (sem etapas repetidas)`);
    // Entre bocados a peça aproxima-se, mas nunca chega ao passo seguinte.
    estados[k - 1].forEach((alvo, i) => {
      if (!alvo.encaixada && alvo.visivel) assert.ok(alvo.limite < agora[i] + 1e-9, `${total} bocados: a espera da peça ${i} não passa o bocado ${k}`);
    });
  }
  assert.ok(estados.at(-1)!.every((a) => a.encaixada), `${total} bocados: pronta, montada`);
}
const tres = alvosDasPecas('a-descarregar', download(1, 3));
assert.equal(tres[0].encaixada, true, 'o 1.º bocado encaixa a aresta esquerda');
assert.equal(tres[1].visivel && !tres[1].encaixada, true, 'e a de baixo passa a aproximar-se');
assert.equal(tres[2].visivel, false, 'a face ainda não se vê');
assert.equal(alvosDasPecas('a-descarregar', download(2, 3))[2].encaixada, false, 'a face só pousa com a faixa pronta');
assert.ok(alvosDasPecas('a-preparar', null).every((a) => !a.visivel && !a.encaixada), 'antes de haver download, nenhuma peça mexe');
assert.ok(alvosDasPecas('em-disco', null).every((a) => a.encaixada), 'em disco aparece montada');
console.log('Montagem da capa: fases, presos e peças que só avançam passaram.');

// --- o relatório ---
const base: EntradaDoRelatorio = {
  agora: 100000, gerado: '2026-09-14T10:00:00.000Z', versao: '2.9.4', build: 'abc', plataforma: 'ios 26',
  estado: 'nao-comecou',
  faixa: { titulo: 'NOSTYLIST', artista: 'Destroy Lonely', videoId: 'faixa', duracaoS: 181 },
  leitor: { activeBackend: 'resolving', buffering: true, isPlaying: false, downloadProgress: null, posicaoMs: 0, erro: null, appEstado: 'active' },
  arranque: { videoId: 'faixa', pedidoEm: 90000, resolverInicioEm: 90100, resolverFimEm: 91000, cliente: 'ANDROID_VR', erro: null },
  downloads: [
    { videoId: 'outra', prioridade: 'adiantar', fase: 'a-descarregar', pedidoEm: 20000, inicioEm: 20000, bytes: MB, total: 4 * MB, bocados: 1, bocadoBytes: MB, ultimoBocadoEm: 30000, tentativas: 2, ultimoHttp: null, urlRenovado: false },
    { videoId: 'faixa', prioridade: 'reproducao', fase: 'na-fila', pedidoEm: 91000, inicioEm: null, bytes: 0, total: null, bocados: 0, bocadoBytes: MB, ultimoBocadoEm: null, tentativas: 0, ultimoHttp: null, urlRenovado: false },
  ],
  fila: { aDescarregar: 1, emEspera: 1 },
  rede: { offline: false, dadosMoveis: true },
  ultimoErroDoPoToken: null,
  eventos: [{ tipo: 'teste' }],
};
const r = montarRelatorioDoArranque(base) as any;
assert.equal(r.estado, 'nao-comecou');
assert.equal(r.haQuantoTempoMs, 10000, 'não começou: desde que a faixa foi pedida');
assert.equal(r.resolvedor.acabou, true);
assert.equal(r.resolvedor.cliente, 'ANDROID_VR');
assert.equal(r.download.fase, 'na-fila', 'o download da faixa é o dela, não o que ocupa a vaga');
const quemOcupa = r.filaDeDownloads.downloads.find((d: any) => d.fase === 'a-descarregar');
assert.equal(quemOcupa.videoId, 'outra', 'diz quem tem a vaga');
assert.equal(quemOcupa.ultimoBocadoHaMs, 70000, 'e há quanto tempo não recebe nada');
assert.equal(quemOcupa.daFaixaAtual, false);
assert.equal(r.filaDeDownloads.prazoDaVagaMs, 240000);
assert.deepEqual(r.eventos, [{ tipo: 'teste' }]);
const meio = montarRelatorioDoArranque({
  ...base, estado: 'preso-a-meio',
  downloads: [{ ...base.downloads[1], fase: 'a-descarregar', inicioEm: 92000, bocados: 1, ultimoBocadoEm: 93000 }],
}) as any;
assert.equal(meio.haQuantoTempoMs, 7000, 'preso a meio: desde o último bocado');
const outraFaixa = montarRelatorioDoArranque({ ...base, arranque: { ...base.arranque!, videoId: 'velha' } }) as any;
assert.equal(outraFaixa.resolvedor, null, 'um arranque de outra faixa não entra');
assert.ok(JSON.stringify(r).length > 0, 'o relatório passa a JSON');
console.log('Relatório do arranque: fila, resolvedor e download da faixa certos passaram.');
