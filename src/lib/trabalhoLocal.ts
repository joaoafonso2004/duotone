// Diagnóstico local e limitado, sem conteúdo pessoal nem pedidos à rede.
type Medida = { em: number; tarefa: string; ms: number; tipo: 'sync' | 'await' };
const medidas: Medida[] = [];
const agora = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
function guardar(tarefa: string, inicio: number, tipo: Medida['tipo']): void {
  const ms = Math.round((agora() - inicio) * 10) / 10;
  if (ms < 8) return;
  medidas.push({ em: Date.now(), tarefa, ms, tipo });
  if (medidas.length > 48) medidas.shift();
}
export function medirTrabalho<T>(tarefa: string, fn: () => T): T {
  const inicio = agora();
  try { return fn(); } finally { guardar(tarefa, inicio, 'sync'); }
}
export async function medirEspera<T>(tarefa: string, fn: () => PromiseLike<T>): Promise<T> {
  const inicio = agora();
  try { return await fn(); } finally { guardar(tarefa, inicio, 'await'); }
}
export const cederParaInterface = () => new Promise<void>(resolve => setTimeout(resolve, 0));
export function textoDoTrabalhoLocal(): string {
  return ['local work (last 48 operations >=8ms; await includes I/O, not proof of a JS stall):',
    ...medidas.map(m => `  [${new Date(m.em).toISOString().slice(11, 23)}] ${m.tarefa} ${m.tipo}: ${m.ms}ms`),
  ].join('\n');
}
