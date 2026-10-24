/**
 * O menu do Windows nos campos de texto e no texto selecionado (24/10, fase 1
 * de docs/botao-direito-pc-maquete.html).
 *
 * O Electron não mostra menu nenhum ao botão direito: numa caixa de pesquisa ou
 * no chat, "Paste" só com o Ctrl+V. Isto devolve as linhas do menu nativo para
 * o que o Chromium diz que está debaixo do rato (`params` do evento
 * `context-menu`), com os papéis do Electron a fazer o trabalho.
 *
 * Os menus da app (uma música, um artista...) não passam por aqui: a página
 * cancela o `contextmenu` e o Electron nem emite o evento. No fundo vazio a
 * lista vem vazia, e não aparece nada (nem o "Reload / Inspect").
 *
 * Os rótulos em inglês, como a interface (o papel sozinho seguia a língua do
 * Windows). Puro: `scripts/test-menu-do-texto.cjs`.
 */
function linhasDoMenuDoTexto(params) {
  const p = params || {};
  const pode = p.editFlags || {};
  const selecionado = typeof p.selectionText === 'string' && p.selectionText.trim().length > 0;
  if (p.isEditable) {
    return [
      { role: 'cut', label: 'Cut', enabled: !!pode.canCut },
      { role: 'copy', label: 'Copy', enabled: !!pode.canCopy },
      { role: 'paste', label: 'Paste', enabled: !!pode.canPaste },
      { type: 'separator' },
      { role: 'selectAll', label: 'Select all', enabled: pode.canSelectAll !== false },
    ];
  }
  // Texto selecionado fora de um campo (uma mensagem, uma letra): só copiar.
  if (selecionado) return [{ role: 'copy', label: 'Copy', enabled: true }];
  return [];
}

module.exports = { linhasDoMenuDoTexto };
