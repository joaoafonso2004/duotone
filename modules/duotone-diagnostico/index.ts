import { requireOptionalNativeModule } from 'expo';

/**
 * Ponte para o MetricKit (ver ios/DuotoneDiagnosticoModule.swift). `null` num
 * binário sem o módulo, e aí a app conta só o que o JS vê.
 */
const nativo = requireOptionalNativeModule<{
  lerEApagar(): string;
  cpuDoProcesso?(): string;
  estadoDeEnergia?(): { termico?: unknown; poupanca?: unknown };
}>('DuotoneDiagnostico');

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

const TERMICOS = new Set(['nominal', 'fair', 'serious', 'critical']);

/**
 * O estado térmico e o modo de poupança, agora (2/10). Leve: é o Smart Cache
 * que pergunta, a cada música (`lib/adiantarFaixas.ts`). `null` num binário
 * sem a função, e aí adianta-se como sempre.
 */
export function estadoDeEnergia(): { termico: 'nominal' | 'fair' | 'serious' | 'critical' | 'unknown'; poupanca: boolean } | null {
  try {
    const e = nativo?.estadoDeEnergia?.();
    if (!e) return null;
    const termico = typeof e.termico === 'string' && TERMICOS.has(e.termico) ? e.termico as 'nominal' : 'unknown';
    return { termico, poupanca: e.poupanca === true };
  } catch {
    return null;
  }
}
