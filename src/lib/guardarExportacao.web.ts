/**
 * Guarda um ficheiro da exportação da biblioteca (16/11) no PC: uma
 * transferência, como o "Save playback report" (lib/relatorioDeReproducao.web.ts).
 * No iPhone é a folha de partilha (guardarExportacao.ts).
 */
export async function guardarExportacao(nome: string, conteudo: string, tipo: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([conteudo], { type: `${tipo};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revogar só depois do clique: revogar antes cancela a própria transferência.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
