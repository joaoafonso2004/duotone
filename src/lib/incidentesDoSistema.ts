import { lerDiagnosticosDoSistema } from '../../modules/duotone-diagnostico';
import { incidenteDoMetricKit, type Incidente } from './saudeDaApp';

/**
 * O que o sistema viu e o JS não pôde ver (iPhone: MetricKit). No PC é o
 * processo principal do Electron (`incidentesDoSistema.web.ts`).
 */
export async function lerIncidentesDoSistema(): Promise<{
  incidentes: Incidente[];
  /** Quando o processo começou, em ms desde 1970, se o sistema o disser. */
  processoComecouEm: number | null;
}> {
  const incidentes = lerDiagnosticosDoSistema()
    .map(incidenteDoMetricKit)
    .filter((i): i is Incidente => i !== null);
  return { incidentes, processoComecouEm: null };
}
