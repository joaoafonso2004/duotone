/**
 * O que diz a linha "Check for updates" do About do PC (20/10).
 *
 * A procura e o download da versão nova são a mesma operação no processo
 * principal (`procurarAtualizacao` em electron/main.cjs): o instalador tem
 * ~116 MB, e a linha ficava em "Checking for updates…" o download inteiro --
 * quatro minutos numa ligação de 0,5 MB/s, sem sinal de vida. O João achou
 * que estava preso. Com o download a andar, diz quanto falta.
 *
 * Sem imports: testado em Node (`test-rotulo-da-atualizacao.ts`).
 */
export type DescargaDaAtualizacao = { versao: string; fracao: number };

export function rotuloDaProcuraDeAtualizacoes(e: {
  /** O download em segundo plano, se estiver a correr. Ganha a tudo. */
  descarga: DescargaDaAtualizacao | null;
  /** Fora da atualização automática: a versão nova que o aviso encontrou. */
  versaoNova: string | null;
  /** Fora da atualização automática, instala-se na app (senão vai-se ao site). */
  instalaNaApp: boolean;
  aProcurar: boolean;
}): string {
  if (e.descarga) {
    // Para baixo: "100%" só quando acabou, e aí a linha já mudou.
    const pct = Math.max(0, Math.min(99, Math.floor((Number(e.descarga.fracao) || 0) * 100)));
    return `Downloading Duotone ${e.descarga.versao}… ${pct}%`;
  }
  if (e.versaoNova) return `${e.instalaNaApp ? 'Update to' : 'Download'} Duotone ${e.versaoNova}`;
  return e.aProcurar ? 'Checking for updates…' : 'Check for updates';
}

/** O que chega pela ponte, limpo: uma versão "x.y.z" e uma fração de 0 a 1, ou nada. */
export function lerDescarga(valor: unknown): DescargaDaAtualizacao | null {
  if (!valor || typeof valor !== 'object') return null;
  const { versao, fracao } = valor as { versao?: unknown; fracao?: unknown };
  if (typeof versao !== 'string' || !/^\d+\.\d+\.\d+$/.test(versao)) return null;
  const f = Number(fracao);
  return { versao, fracao: Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0 };
}
