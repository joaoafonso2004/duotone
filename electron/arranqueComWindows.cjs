/**
 * "Start with Windows" vem ligado de origem (27/9, pedido do João).
 *
 * O Windows guarda o arranque automático no registo, e a app só o escrevia
 * quando alguém mexia na opção. Agora, na primeira abertura da app instalada,
 * liga-o -- a abrir a JANELA, e não no tabuleiro: é para as pessoas se
 * lembrarem da app quando ligam o PC (João, 27/9). Quem preferir calado muda
 * para "System tray" nas Definições.
 *
 * **Só uma vez.** Quem o desliga nas Definições (ou no Gestor de Tarefas do
 * Windows) não o vê voltar: o `windows-startup.json` passa a existir com
 * `decidido: true`, e a partir daí manda o que lá está. Um ficheiro antigo, só
 * com o `mode`, também conta como decidido -- era escrito apenas quando a
 * pessoa mexia na opção.
 *
 * Puro: `scripts/test-arranque-com-windows.mjs`.
 */

/** O modo de origem: abre a janela. */
const MODO_DE_ORIGEM = 'window';

/**
 * O que fazer ao abrir, a partir do que está no `windows-startup.json`
 * (`null` quando o ficheiro não existe ou não se lê).
 */
function arranqueAoAbrir(guardado) {
  if (guardado && typeof guardado === 'object') return { ligar: false, gravar: null };
  return { ligar: true, gravar: { mode: MODO_DE_ORIGEM, decidido: true } };
}

/** O que gravar quando a pessoa muda a opção nas Definições. */
function escolhaDaPessoa(mode) {
  return { mode: mode === 'window' ? 'window' : 'tray', decidido: true };
}

module.exports = { MODO_DE_ORIGEM, arranqueAoAbrir, escolhaDaPessoa };
