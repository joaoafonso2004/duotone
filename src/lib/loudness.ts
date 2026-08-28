/**
 * Normalização de volume.
 *
 * O YouTube não masteriza nada: a mesma música posta por dois canais chega
 * com volumes muito diferentes, e passar de um vídeo caseiro para um upload
 * de editora dava um salto de volume desagradável — o problema mais audível
 * de usar o YouTube como fonte.
 *
 * A resposta do player traz `playerConfig.audioConfig.loudnessDb`: a
 * diferença, em dB, entre a loudness daquele áudio e a referência do YouTube.
 * Positivo = mais alto que a referência. O player oficial da web faz
 * exatamente esta conta, e é a mesma que se faz aqui.
 *
 * **Só se pode atenuar.** O AVPlayer não passa de `volume = 1.0`, por isso
 * faixas mais baixas do que a referência ficam onde estão e as mais altas
 * descem até ao nível comum. É o suficiente: o que incomoda é a faixa que
 * rebenta a seguir a uma calma, não a calma a seguir à normal.
 *
 * Sem imports de runtime, para ser testável em Node puro (scripts/test-loudness.ts).
 */

/** Chão do ganho. Um `loudnessDb` disparatado (metadados corrompidos) não
 * pode emudecer a faixa — mais vale ficar alto do que inaudível. */
export const MIN_GAIN = 0.15;

/**
 * Ganho a aplicar ao volume do player, entre MIN_GAIN e 1.
 *
 * Sem valor de loudness (faixas descarregadas antes desta funcionalidade, ou
 * um cliente do InnerTube que não o devolva) volta 1: sem informação, não se
 * mexe no volume.
 */
export function normalizedGain(loudnessDb: number | null | undefined): number {
  if (typeof loudnessDb !== 'number' || !Number.isFinite(loudnessDb)) return 1;
  const gain = Math.pow(10, -loudnessDb / 20);
  if (!Number.isFinite(gain)) return 1;
  return Math.min(1, Math.max(MIN_GAIN, gain));
}

/** O ganho já a contar com a preferência do utilizador. */
export function targetVolume(
  loudnessDb: number | null | undefined,
  enabled: boolean
): number {
  return enabled ? normalizedGain(loudnessDb) : 1;
}

/** Lê o `loudnessDb` de uma resposta do player, tolerante à forma. */
export function readLoudnessDb(playerResponse: any): number | null {
  const raw = playerResponse?.playerConfig?.audioConfig?.loudnessDb;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}
