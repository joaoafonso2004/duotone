// Contadores locais: nunca são publicados no Supabase e não guardam nomes/ids.
type Origem = 'memoria' | 'disco' | 'servidor';
const leituras = { memoria: 0, disco: 0, servidor: 0, conta: 0 };
const passagens: { em: number; faixas: number; pares: number; ms: number }[] = [];
export function contarCache(origem: Origem, publica = true): void {
  if (publica) leituras[origem]++;
  else if (origem === 'servidor') leituras.conta++;
}
export function medirPassagem(faixas: number, pares: number, ms: number): void {
  passagens.push({ em: Date.now(), faixas, pares, ms });
  if (passagens.length > 12) passagens.shift();
}
export function textoDoTrabalhoDeMetadados(): string {
  return ['metadata work (local counters since app start):',
    `  public cache: ${leituras.memoria} memory hits, ${leituras.disco} disk hits, ${leituras.servidor} Supabase reads`,
    `  account cache: ${leituras.conta} Supabase reads`,
    '  artist scans: synchronous time only; network wait excluded',
    ...passagens.map(p => `  [${new Date(p.em).toISOString().slice(11, 19)}] ${p.faixas} tracks, ${p.pares} ambiguous pairs: ${p.ms}ms`),
  ].join('\n');
}
