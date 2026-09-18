import { lerIncidentes, type Incidente } from './saudeDaApp';

/**
 * O que o processo principal do Electron viu (electron/saude.cjs): o renderer
 * que morreu, a GPU, os crashes do Crashpad, as exceções do próprio processo.
 * No browser, sem ponte, não há nada.
 */
export async function lerIncidentesDoSistema(): Promise<{
  incidentes: Incidente[];
  processoComecouEm: number | null;
}> {
  const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.lerSaude : undefined;
  if (!ponte) return { incidentes: [], processoComecouEm: null };
  try {
    const r = await ponte();
    const inicio = Number(r?.processoComecouEm);
    return {
      incidentes: lerIncidentes(JSON.stringify(Array.isArray(r?.incidentes) ? r.incidentes : [])),
      processoComecouEm: Number.isFinite(inicio) && inicio > 0 ? inicio : null,
    };
  } catch {
    return { incidentes: [], processoComecouEm: null };
  }
}
