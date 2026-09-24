'use strict';
/**
 * Os atalhos globais do PC (entrega 2a do docs/PLANO-OFFLINE-SOCIAL-DESCOBERTA-PC.md).
 *
 * NENHUM vem posto: cada um cria-se nas Definições (decisão do João a 24/9). As
 * teclas multimédia (play/pausa, seguinte, anterior do teclado) continuam à
 * parte, no main.cjs: são do teclado, não são atalhos escolhidos por alguém.
 *
 * Aqui só se decide -- validar, normalizar, converter a tecla, conflitos, o
 * aviso do AltGr --, sem Electron. O main.cjs regista; o ficheiro é
 * `atalhos.json` em userData, porque um atalho é do teclado daquele PC e não
 * viaja pela conta. Testado em scripts/test-atalhos.mjs.
 */

/** As ações, numa lista fechada: do renderer só pode vir um destes ids. */
const ACOES = Object.freeze([
  'tocar-pausa', 'seguinte', 'anterior', 'guardar',
  'volume-mais', 'volume-menos', 'avancar-10', 'recuar-10',
  'shuffle', 'repeat', 'pesquisar', 'mostrar-janela', 'mini-leitor',
]);

/** As que o processo principal faz sozinho; as outras vão para a página. */
const DO_PROCESSO_PRINCIPAL = Object.freeze(['mostrar-janela', 'mini-leitor']);

const MODIFICADORES = ['Ctrl', 'Alt', 'Shift', 'Super'];
const SINONIMOS = {
  control: 'Ctrl', ctrl: 'Ctrl', commandorcontrol: 'Ctrl', cmdorctrl: 'Ctrl',
  alt: 'Alt', option: 'Alt', altgr: null,
  shift: 'Shift',
  super: 'Super', meta: 'Super', win: 'Super', windows: 'Super', command: 'Super', cmd: 'Super',
};

const TECLAS_COM_NOME = [
  'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Enter', 'Up', 'Down', 'Left', 'Right',
  'Home', 'End', 'PageUp', 'PageDown', 'Plus',
];
const PONTUACAO = [',', '.', '/', ';', "'", '[', ']', '\\', '-', '=', '`'];
const NOMES_DE_TECLAS = { return: 'Enter', esc: null, escape: null, pageup: 'PageUp', pagedown: 'PageDown' };

/** A tecla principal, normalizada, ou `null` se não pode ser atalho. */
function normalizarTecla(bruta) {
  const t = String(bruta || '').trim();
  if (!t) return null;
  if (/^[a-z]$/i.test(t)) return t.toUpperCase();
  if (/^[0-9]$/.test(t)) return t;
  const f = /^f([1-9]|1[0-9]|2[0-4])$/i.exec(t);
  if (f) return `F${f[1]}`;
  if (PONTUACAO.includes(t)) return t;
  const baixa = t.toLowerCase();
  if (baixa in NOMES_DE_TECLAS) return NOMES_DE_TECLAS[baixa];
  const nome = TECLAS_COM_NOME.find((n) => n.toLowerCase() === baixa);
  return nome || null;
}

/**
 * "shift+ctrl+p" → "Ctrl+Shift+P". Os modificadores saem sempre pela mesma
 * ordem, e é por isso que dois atalhos escritos de maneiras diferentes se
 * reconhecem como o mesmo. `null` se não é um accelerator válido.
 */
function normalizar(texto) {
  if (typeof texto !== 'string' || texto.length > 60) return null;
  // "Plus" é a tecla +, porque o + separa as partes.
  const partes = texto.split('+').map((p) => p.trim()).filter(Boolean);
  if (!partes.length) return null;
  const mods = new Set();
  let tecla = null;
  for (const p of partes) {
    const m = SINONIMOS[p.toLowerCase()];
    if (m === null) return null;
    if (m) { mods.add(m); continue; }
    if (tecla) return null;
    tecla = normalizarTecla(p);
    if (!tecla) return null;
  }
  if (!tecla) return null;
  return [...MODIFICADORES.filter((m) => mods.has(m)), tecla].join('+');
}

/**
 * Pode ser um atalho GLOBAL? Um atalho global apanha a tecla em todas as apps,
 * por isso uma tecla sozinha (ou só com Shift, que é escrever maiúsculas)
 * roubava a escrita ao PC inteiro. F13–F24 não existem em quase nenhum
 * teclado a sério e são o que as teclas programáveis mandam: essas podem ir
 * sozinhas.
 */
function validar(texto) {
  const a = normalizar(texto);
  if (!a) return { ok: false, erro: 'invalido' };
  const partes = a.split('+');
  const tecla = partes[partes.length - 1];
  const mods = partes.slice(0, -1);
  const soltaPermitida = /^F(1[3-9]|2[0-4])$/.test(tecla);
  if (!soltaPermitida && !mods.some((m) => m !== 'Shift')) return { ok: false, erro: 'sem-modificador' };
  return { ok: true, accelerator: a };
}

/**
 * O `keydown` da página → accelerator. Usa o `code` (a posição da tecla) e não
 * o `key`, que com o Shift ou o AltGr já vem transformado ("!" em vez de "1").
 * `null` enquanto só há modificadores carregados.
 */
function doEvento(e) {
  if (!e || typeof e.code !== 'string') return null;
  const c = e.code;
  let tecla = null;
  let m;
  if ((m = /^Key([A-Z])$/.exec(c))) tecla = m[1];
  else if ((m = /^Digit([0-9])$/.exec(c))) tecla = m[1];
  else if ((m = /^Numpad([0-9])$/.exec(c))) tecla = m[1];
  else if ((m = /^F([1-9]|1[0-9]|2[0-4])$/.exec(c))) tecla = `F${m[1]}`;
  else if ((m = /^Arrow(Up|Down|Left|Right)$/.exec(c))) tecla = m[1];
  else {
    const mapa = {
      Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
      Enter: 'Enter', NumpadEnter: 'Enter', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
      Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
      Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', NumpadAdd: 'Plus', NumpadSubtract: '-',
    };
    tecla = mapa[c] || null;
  }
  if (!tecla) return null;
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  return [...mods, tecla].join('+');
}

/**
 * No Windows o AltGr chega como Ctrl+Alt. No teclado português, Ctrl+Alt+7 é
 * a `{` -- um atalho global nessa combinação deixava de a escrever em todas as
 * apps. Não se proíbe (quem não programa pode querer), avisa-se.
 */
const ALTGR_PT = { 2: '@', 3: '£', 4: '§', 7: '{', 8: '[', 9: ']', 0: '}', E: '€', '=': '}' };
function avisoDeAltGr(texto) {
  const a = normalizar(texto);
  if (!a) return null;
  const partes = a.split('+');
  const mods = partes.slice(0, -1);
  if (mods.length !== 2 || mods[0] !== 'Ctrl' || mods[1] !== 'Alt') return null;
  return ALTGR_PT[partes[partes.length - 1]] || null;
}

/** O que está gravado → só as entradas válidas, de ações conhecidas, sem repetidos. */
function lerAtalhos(guardado) {
  const saida = {};
  if (!guardado || typeof guardado !== 'object') return saida;
  const usados = new Set();
  for (const acao of ACOES) {
    const v = validar(guardado[acao]);
    if (!v.ok || usados.has(v.accelerator)) continue;
    usados.add(v.accelerator);
    saida[acao] = v.accelerator;
  }
  return saida;
}

/** Que outra ação da app já usa este accelerator (ou `null`). */
function conflito(atalhos, acao, texto) {
  const a = normalizar(texto);
  if (!a) return null;
  for (const [outra, usado] of Object.entries(atalhos || {})) {
    if (outra !== acao && usado === a) return outra;
  }
  return null;
}

/**
 * Pedido do renderer → o novo mapa, ou o erro. `null`/"" no accelerator tira o
 * atalho. A ação tem de estar na lista fechada.
 */
function definir(atalhos, acao, texto) {
  if (!ACOES.includes(acao)) return { ok: false, erro: 'acao-desconhecida' };
  const base = lerAtalhos(atalhos);
  if (texto === null || texto === '') {
    const semEste = { ...base };
    delete semEste[acao];
    return { ok: true, atalhos: semEste };
  }
  const v = validar(texto);
  if (!v.ok) return v;
  const outra = conflito(base, acao, v.accelerator);
  if (outra) return { ok: false, erro: 'em-uso-na-app', outra };
  return { ok: true, atalhos: { ...base, [acao]: v.accelerator }, accelerator: v.accelerator };
}

module.exports = {
  ACOES, DO_PROCESSO_PRINCIPAL, normalizar, validar, doEvento, avisoDeAltGr, lerAtalhos, conflito, definir,
};
