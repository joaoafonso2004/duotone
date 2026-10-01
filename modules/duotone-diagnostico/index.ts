import { requireOptionalNativeModule } from 'expo';

/**
 * Ponte para o MetricKit (ver ios/DuotoneDiagnosticoModule.swift). `null` num
 * binário sem o módulo, e aí a app conta só o que o JS vê.
 */
const nativo = requireOptionalNativeModule<{ lerEApagar(): string; cpuDoProcesso?(): string }>('DuotoneDiagnostico');

/** Os resumos que o iOS entregou desde a última leitura. Ler apaga-os. */
export function lerDiagnosticosDoSistema(): unknown[] {
  try {
    const lista = JSON.parse(nativo?.lerEApagar() ?? '[]');
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/**
 * O CPU gasto pelo processo até agora (total e por thread viva) e o estado
 * térmico. `null` num binário sem a função (anterior a 1/10) ou se falhar.
 * Ver `lib/energiaEmSegundoPlano.ts`.
 */
export function cpuDoProcesso(): unknown {
  try {
    const texto = nativo?.cpuDoProcesso?.();
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}
