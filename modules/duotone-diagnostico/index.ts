import { requireOptionalNativeModule } from 'expo';

/**
 * Ponte para o MetricKit (ver ios/DuotoneDiagnosticoModule.swift). `null` num
 * binário sem o módulo, e aí a app conta só o que o JS vê.
 */
const nativo = requireOptionalNativeModule<{ lerEApagar(): string }>('DuotoneDiagnostico');

/** Os resumos que o iOS entregou desde a última leitura. Ler apaga-os. */
export function lerDiagnosticosDoSistema(): unknown[] {
  try {
    const lista = JSON.parse(nativo?.lerEApagar() ?? '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}
