/**
 * A secção "resources" do relatório de reprodução do PC (27/9): quanta memória
 * e CPU gasta cada processo do Duotone, e o tamanho do vídeo que o leitor do
 * YouTube está a descodificar. Nasceu de o João ver 700 MB e 10% de CPU no
 * Gestor de Tarefas sem se saber de onde vinham. Os números vêm do processo
 * principal (`diagnostico:recursos`, `app.getAppMetrics`); aqui só se escrevem.
 *
 * Sem imports: `scripts/test-recursos-da-app.ts`.
 */

export type Processo = { tipo: string; nome: string; cpu: number; memoriaMB: number; privadaMB: number };
export type Video = { altura: number; largura: number; aTocar: boolean } | null;
export type Amostra = { janela: string; processos: Processo[]; youtube: Video[]; em?: string };

const soma = (ps: readonly Processo[], campo: 'cpu' | 'memoriaMB' | 'privadaMB') =>
  Math.round(ps.reduce((s, p) => s + (Number.isFinite(p[campo]) ? p[campo] : 0), 0) * 10) / 10;

function bloco(titulo: string, a: Amostra): string[] {
  const linhas = [`${titulo} (window ${a.janela}${a.em ? `, ${a.em}` : ''})`];
  const ordem = [...a.processos].sort((x, y) => y.memoriaMB - x.memoriaMB);
  for (const p of ordem) {
    const nome = p.nome ? ` ${p.nome}` : '';
    linhas.push(`  ${p.tipo}${nome}: ${p.memoriaMB} MB (private ${p.privadaMB} MB), CPU ${p.cpu}%`);
  }
  linhas.push(`  total: ${soma(a.processos, 'memoriaMB')} MB, CPU ${soma(a.processos, 'cpu')}%`);
  if (!a.youtube.length) linhas.push('  YouTube players: none');
  a.youtube.forEach((v, i) => {
    linhas.push(v
      ? `  YouTube player ${i + 1}: ${v.largura}x${v.altura} video, ${v.aTocar ? 'playing' : 'paused'}`
      : `  YouTube player ${i + 1}: no video`);
  });
  return linhas;
}

/** O texto da secção, ou `null` quando não há números (browser, ponte antiga). */
export function textoDosRecursos(r: (Amostra & { escondida?: Amostra | null }) | null | undefined): string | null {
  if (!r || !Array.isArray(r.processos) || !r.processos.length) return null;
  const linhas = ['== resources ==', ...bloco('now', r)];
  linhas.push(...(r.escondida ? bloco('last minute hidden', r.escondida) : ['last minute hidden: no sample yet (leave Duotone minimized for a minute)']));
  return linhas.join('\n');
}
