import { juntarArranque, type Arranque } from '../lib/tempoAteAoSom';

/**
 * O "time to first sound" do PC (21/11, F4 do plano do Tauri): o par web do
 * `tempoAteAoSom.ts` do iPhone, sem os downloads (o motor só de áudio toca
 * enquanto chega, e o IFrame não tem fases). Quem anota é o motor
 * (`motorDeAudio.web.tsx`), com a resolução que ele mediu. Só em memória.
 */
let medidas: Arranque[] = [];

/** No iPhone liga-se aos downloads; no PC não há nada a ligar. */
export function ligarTempoAteAoSom(): void {}

/** Chamado pelo motor no primeiro som de uma faixa pedida. */
export function anotarPrimeiroSom(
  videoId: string,
  titulo: string,
  origem: string,
  totalMs: number,
  pedidaEm = Date.now() - totalMs,
  resolverMs: number | null = null,
): void {
  void videoId; void pedidaEm;
  medidas = juntarArranque(medidas, { titulo, origem, totalMs, resolverMs, filaMs: null, downloadMs: null, mb: null, em: Date.now() });
}

export function arranquesMedidos(): readonly Arranque[] {
  return medidas;
}
