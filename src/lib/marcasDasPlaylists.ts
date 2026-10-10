/**
 * As marcas ✓ da folha "Add to playlist" (10/10): em que playlists a música já
 * está.
 *
 * "Às vezes, quando vais adicionar uma música a uma playlist, aparece que já a
 * tens lá com o certinho, mas não tens" (um amigo do João). A folha fica
 * montada entre aberturas e as marcas eram as da ÚLTIMA música: só se
 * atualizavam quando a nova já existia no catálogo (`tracks`), e uma música
 * que ninguém tinha guardado ficava com os ✓ da anterior. O mesmo quando a
 * leitura falhava, e uma resposta atrasada da música anterior podia chegar
 * depois da nova.
 *
 * Agora cada abertura começa SEM marcas e só publica a resposta se ainda for a
 * da abertura mais recente. Puro: `scripts/test-marcas-das-playlists.ts`.
 */
export function criarMarcasDasPlaylists<T>(
  ler: (faixa: T) => Promise<{ ids: Set<string>; idDaFaixa: string | null }>,
  publicar: (ids: Set<string>, idDaFaixa: string | null) => void,
): { abrir: (faixa: T | null) => Promise<void>; esquecer: () => void } {
  let pedido = 0;
  return {
    async abrir(faixa) {
      const meu = ++pedido;
      publicar(new Set(), null);
      if (!faixa) return;
      try {
        const lido = await ler(faixa);
        if (meu === pedido) publicar(lido.ids, lido.idDaFaixa);
      } catch {
        // Sem a leitura, sem marcas: nunca as de outra música.
      }
    },
    /** A folha fechou: uma resposta que ainda venha a caminho não conta. */
    esquecer() { pedido++; },
  };
}
