/** Texto comparável para pesquisas locais: caixa e acentos não contam. */
export function normalizarPesquisa(valor: string | null | undefined): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

export function correspondeAPesquisa(
  pesquisa: string,
  ...campos: Array<string | null | undefined>
): boolean {
  const agulha = normalizarPesquisa(pesquisa);
  return !agulha || campos.some((campo) => normalizarPesquisa(campo).includes(agulha));
}
