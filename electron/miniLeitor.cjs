'use strict';
/**
 * O mini leitor do PC (entrega 2b do docs/PLANO-OFFLINE-SOCIAL-DESCOBERTA-PC.md):
 * onde a janela fica. Puro, sem Electron -- testado em
 * scripts/test-mini-leitor.mjs. Quem cria a janela e fala com ela é o main.cjs.
 *
 * É um COMANDO À DISTÂNCIA: a música continua na janela principal, porque o
 * IFrame do YouTube não muda de janela sem recarregar (e cortar o som).
 */

const TAMANHOS = Object.freeze({
  compacto: { width: 360, height: 88 },
  expandido: { width: 320, height: 400 },
});
const MARGEM = 16;
const ENCOSTAR = 12;

/** A chave de um monitor: as medidas dele. Os ids mudam entre arranques. */
function chaveDoMonitor(area) {
  return `${area.x},${area.y},${area.width}x${area.height}`;
}

/** Canto de baixo à direita da área de trabalho (acima da barra de tarefas). */
function posicaoInicial(area, tamanho) {
  return {
    x: Math.round(area.x + area.width - tamanho.width - MARGEM),
    y: Math.round(area.y + area.height - tamanho.height - MARGEM),
  };
}

/** A área que contém o centro da janela; sem nenhuma, a mais próxima. */
function areaDe(pos, tamanho, areas) {
  if (!areas.length) return null;
  const cx = pos.x + tamanho.width / 2;
  const cy = pos.y + tamanho.height / 2;
  const dentro = areas.find((a) => cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height);
  if (dentro) return dentro;
  let melhor = areas[0];
  let menor = Infinity;
  for (const a of areas) {
    const dx = Math.max(a.x - cx, 0, cx - (a.x + a.width));
    const dy = Math.max(a.y - cy, 0, cy - (a.y + a.height));
    const d = dx * dx + dy * dy;
    if (d < menor) { menor = d; melhor = a; }
  }
  return melhor;
}

/** A janela inteira dentro da área (um monitor desligado não a deixa perdida). */
function prender(pos, tamanho, area) {
  const x = Math.min(Math.max(pos.x, area.x), area.x + area.width - tamanho.width);
  const y = Math.min(Math.max(pos.y, area.y), area.y + area.height - tamanho.height);
  return { x: Math.round(x), y: Math.round(y) };
}

/** A menos de 12 px de uma borda, encosta à margem dela. */
function encostar(pos, tamanho, area) {
  let { x, y } = pos;
  const esquerda = area.x + MARGEM;
  const direita = area.x + area.width - tamanho.width - MARGEM;
  const cima = area.y + MARGEM;
  const baixo = area.y + area.height - tamanho.height - MARGEM;
  if (Math.abs(x - esquerda) <= ENCOSTAR) x = esquerda;
  else if (Math.abs(x - direita) <= ENCOSTAR) x = direita;
  if (Math.abs(y - cima) <= ENCOSTAR) y = cima;
  else if (Math.abs(y - baixo) <= ENCOSTAR) y = baixo;
  return prender({ x, y }, tamanho, area);
}

/**
 * Onde abrir: a posição guardada para este monitor, se ainda cabe; senão o
 * canto de baixo à direita do monitor principal.
 */
function ondeAbrir(guardado, tamanho, areas, principal) {
  const porMonitor = (guardado && guardado.porMonitor) || {};
  for (const area of areas) {
    const p = porMonitor[chaveDoMonitor(area)];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return prender(p, tamanho, area);
  }
  const area = principal || areas[0];
  return posicaoInicial(area, tamanho);
}

/**
 * Mudar de tamanho mantendo o canto mais perto de uma borda: um mini encostado
 * em baixo à direita cresce para cima e para a esquerda, não para fora do ecrã.
 */
function mudarDeTamanho(pos, de, para, area) {
  const direita = pos.x + de.width / 2 > area.x + area.width / 2;
  const baixo = pos.y + de.height / 2 > area.y + area.height / 2;
  const x = direita ? pos.x + de.width - para.width : pos.x;
  const y = baixo ? pos.y + de.height - para.height : pos.y;
  return prender({ x, y }, para, area);
}

/**
 * Para que lado da janela a BARRA recolhida se encosta (25/9: o mini é uma
 * barra fina que abre com o rato por cima). A janela não muda de tamanho --
 * isso aos solavancos no Windows --, muda o cartão lá dentro, e tem de crescer
 * para longe da borda do ecrã: encostado em baixo abre para cima.
 */
function ancoraDoMini(pos, tamanho, area) {
  if (!area) return 'baixo';
  return pos.y + tamanho.height / 2 > area.y + area.height / 2 ? 'baixo' : 'cima';
}

/**
 * O TAMANHO do mini é uma escala sobre o desenho de base (25/9: "ajustado em
 * tamanho sem ficar tudo desformatado"). Tudo cresce na mesma proporção -- a
 * página desenha-se sempre a 360x88 (ou 320x400) e é ampliada --, por isso a
 * disposição nunca muda com o tamanho.
 */
const ESCALA_MINIMA = 0.8;
const ESCALA_MAXIMA = 1.8;

function escalaValida(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.round(Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, n)) * 100) / 100;
}

function comEscala(tamanho, escala) {
  return { width: Math.round(tamanho.width * escala), height: Math.round(tamanho.height * escala) };
}

/**
 * Os lados que ficam PARADOS a mudar de tamanho: os mais perto das bordas do
 * ecrã. Um mini em baixo à direita cresce para cima e para a esquerda (a pega
 * fica no canto oposto, o de cima à esquerda).
 */
function ladosFixos(pos, tamanho, area) {
  if (!area) return { direita: true, baixo: true };
  return {
    direita: pos.x + tamanho.width / 2 > area.x + area.width / 2,
    baixo: pos.y + tamanho.height / 2 > area.y + area.height / 2,
  };
}

/**
 * Arrastar a pega: a escala sai da LARGURA entre o canto parado e o rato (a
 * altura segue a proporção). `fixo` é o canto parado em coordenadas de ecrã.
 */
function arrastarPega(fixo, rato, base, lados) {
  const largura = lados.direita ? fixo.x - rato.x : rato.x - fixo.x;
  const escala = escalaValida(largura / base.width);
  const t = comEscala(base, escala);
  return {
    escala,
    bounds: {
      x: lados.direita ? fixo.x - t.width : fixo.x,
      y: lados.baixo ? fixo.y - t.height : fixo.y,
      ...t,
    },
  };
}

/** O que se grava depois de mexer: a posição, por monitor. */
function lembrar(guardado, pos, area) {
  const base = guardado && typeof guardado === 'object' ? guardado : {};
  return {
    ...base,
    porMonitor: { ...(base.porMonitor || {}), [chaveDoMonitor(area)]: { x: pos.x, y: pos.y } },
  };
}

/** Os comandos que a janela do mini pode mandar: uma lista fechada. */
const COMANDOS = Object.freeze(['tocar-pausa', 'seguinte', 'anterior', 'guardar', 'procurar', 'expandir', 'encolher', 'fechar', 'abrir-duotone', 'alternar-duotone']);

function comandoValido(c) {
  if (!c || typeof c !== 'object' || !COMANDOS.includes(c.tipo)) return null;
  if (c.tipo === 'procurar') {
    const ms = Number(c.ms);
    return Number.isFinite(ms) && ms >= 0 && ms < 24 * 3600_000 ? { tipo: 'procurar', ms: Math.round(ms) } : null;
  }
  return { tipo: c.tipo };
}

/** O resumo que a janela principal publica: só estes campos passam para o mini. */
function resumoValido(r) {
  if (!r || typeof r !== 'object') return null;
  const texto = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
  const numero = (v) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
  const capa = texto(r.capa, 500);
  return {
    titulo: texto(r.titulo, 200),
    artista: texto(r.artista, 200),
    capa: capa && /^https:\/\//.test(capa) ? capa : null,
    aTocar: r.aTocar === true,
    guardada: r.guardada === true,
    posicaoMs: numero(r.posicaoMs),
    duracaoMs: numero(r.duracaoMs),
  };
}

module.exports = {
  TAMANHOS, MARGEM, chaveDoMonitor, posicaoInicial, areaDe, prender, encostar, ondeAbrir, mudarDeTamanho,
  ancoraDoMini, lembrar, COMANDOS, comandoValido, resumoValido,
  ESCALA_MINIMA, ESCALA_MAXIMA, escalaValida, comEscala, ladosFixos, arrastarPega,
};
