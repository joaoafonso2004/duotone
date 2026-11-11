'use strict';
/**
 * A Duotone nos controlos de média do Windows (SMTC): o cartão do Win+A, o
 * ecrã bloqueado, os botões dos auscultadores Bluetooth e apps como o Gear
 * Control (issue #10, 11/11).
 *
 * ## O que estava mal, medido antes de mexer
 *
 * Num Electron 44 à parte, a perguntar ao próprio Windows
 * (`GlobalSystemMediaTransportControlsSessionManager`) que sessões via:
 *
 * 1. **As teclas de média no `globalShortcut` escondem a app do Windows.**
 *    Basta PEDI-LAS (o registo até falhou, porque a Duotone instalada já as
 *    tinha) para o Electron desligar o tratamento interno das teclas de média,
 *    e com ele o SMTC. Sem o registo, a sessão aparece.
 * 2. **O Windows lê a sessão do frame que TOCA.** O som é do iframe do YouTube,
 *    que define os seus próprios metadados: a sessão aparecia com o título do
 *    vídeo ("Me at the zoo" / "jawed") e SEM seguinte nem anterior. Os
 *    metadados e as ações que a página põe no `navigator.mediaSession` não
 *    chegavam lá. Tirar só os atalhos (a correção proposta no issue) dava isto:
 *    a Duotone aparecia, com o título errado, e as teclas seguinte/anterior
 *    do teclado deixavam de funcionar, que hoje funcionam pelos atalhos.
 * 3. **Uma página com um leitor de silêncio não resolve:** com dois frames a
 *    tocar, cada um com metadados, a sessão desaparecia de todo.
 *
 * ## O que se faz
 *
 * O processo principal entra no frame do YouTube (o `executeJavaScript` do
 * WebFrameMain, o mesmo do equalizador) e põe lá a sessão da Duotone: os
 * metadados da música, o estado, a posição, e as ações. As escritas do próprio
 * YouTube nos metadados e nessas ações passam a ser ignoradas. As ações voltam
 * à página por `postMessage`, só para a origem da app. Visto no Windows com o
 * embed verdadeiro: o título da Duotone, seguinte e anterior ligados, e os
 * comandos do Windows a chegarem à página.
 *
 * Aqui só se valida o pedido e se escreve o script; quem injeta é o main.cjs.
 * Testado em scripts/test-sessao-de-media.cjs.
 */

const ACOES = Object.freeze(['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'stop']);
const ESTADOS = new Set(['playing', 'paused', 'none']);

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/** O pedido do renderer, ou `null` se não serve. Só https na capa. */
function validarSessao(pedido) {
  if (!pedido || typeof pedido !== 'object' || Array.isArray(pedido)) return null;
  const estado = ESTADOS.has(pedido.estado) ? pedido.estado : 'none';
  const titulo = texto(pedido.titulo, 300);
  if (!titulo && estado !== 'none') return null;
  const capa = texto(pedido.capa, 2048);
  const duracao = numero(pedido.duracao);
  const posicao = numero(pedido.posicao);
  return {
    titulo,
    artista: texto(pedido.artista, 300),
    album: texto(pedido.album, 300),
    capa: /^https:\/\//i.test(capa) ? capa : '',
    estado,
    duracao: duracao && duracao > 0 ? duracao : null,
    posicao: duracao && posicao !== null ? Math.min(posicao, duracao) : null,
  };
}

/**
 * O código que corre dentro do frame do YouTube. Idempotente: a primeira vez
 * trava as escritas do YouTube e liga as ações; as seguintes só atualizam.
 */
function scriptDaSessao(sessao, origemDaApp) {
  const dados = JSON.stringify({ ...sessao, acoes: ACOES, origem: origemDaApp });
  return `(() => {
  const d = ${dados};
  const ms = navigator.mediaSession;
  if (!ms || typeof MediaMetadata === 'undefined') return false;
  const proto = Object.getPrototypeOf(ms);
  const meta = Object.getOwnPropertyDescriptor(proto, 'metadata');
  const estado = Object.getOwnPropertyDescriptor(proto, 'playbackState');
  const ligar = proto.setActionHandler;
  if (!window.__duotoneSessao) {
    window.__duotoneSessao = true;
    // O YouTube volta a escrever o título do vídeo a cada vídeo novo: deixa de poder.
    Object.defineProperty(ms, 'metadata', { configurable: true, get: () => meta.get.call(ms), set: () => {} });
    Object.defineProperty(ms, 'playbackState', { configurable: true, get: () => estado.get.call(ms), set: () => {} });
    ms.setActionHandler = (acao, f) => { if (!d.acoes.includes(acao)) ligar.call(ms, acao, f); };
    for (const acao of d.acoes) {
      try {
        ligar.call(ms, acao, (det) => parent.postMessage({ duotoneMedia: acao, seekTime: det && det.seekTime }, d.origem));
      } catch (e) {}
    }
  }
  meta.set.call(ms, d.titulo ? new MediaMetadata({
    title: d.titulo, artist: d.artista, album: d.album,
    artwork: d.capa ? [{ src: d.capa }] : [],
  }) : null);
  estado.set.call(ms, d.estado);
  try {
    if (d.duracao) ms.setPositionState({ duration: d.duracao, position: d.posicao || 0, playbackRate: 1 });
    else ms.setPositionState();
  } catch (e) {}
  return true;
})()`;
}

module.exports = { ACOES, validarSessao, scriptDaSessao };
