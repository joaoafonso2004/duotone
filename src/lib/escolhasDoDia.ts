/**
 * As datas das Músicas do dia, sem relógio nenhum lá dentro.
 *
 * O dia é o do SERVIDOR: o `current_date` do Supabase, que corre em UTC. É a
 * mesma meia-noite para toda a gente e ninguém muda de dia a mexer no relógio
 * do telemóvel -- ver `supabase/uma-musica-por-dia.sql`. Por isso aqui tudo se
 * conta em UTC, e o "agora" entra por parâmetro para os testes não dependerem
 * da hora a que correm.
 *
 * Sem imports de runtime: `scripts/test-escolhas-do-dia.ts` corre em Node puro.
 */

const DIA_MS = 86_400_000;

/**
 * Quantos dias para trás mostra o histórico.
 *
 * Uma semana: chega para ver o que os amigos escolheram desde o último fim de
 * semana, e é pouco o bastante para a página continuar a ser sobre HOJE. Cada
 * dia é uma ida à base, feitas todas ao mesmo tempo.
 */
export const DIAS_DE_HISTORICO = 6;

/** O dia (UTC) de um instante, como o `date` do Postgres: `2026-09-10`. */
export function diaUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Os `n` dias antes de hoje, do mais recente para o mais antigo. */
export function diasAnteriores(agoraMs: number, n: number): string[] {
  const hoje = Date.parse(`${diaUtc(agoraMs)}T00:00:00Z`);
  return Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => diaUtc(hoje - (i + 1) * DIA_MS));
}

const SEMANA = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Como se mostra um dia: "Yesterday", o dia da semana nesta semana, e a data
 * curta daí para trás. Em inglês, como o resto da interface.
 */
export function rotuloDoDia(dia: string, agoraMs: number): string {
  const alvo = Date.parse(`${dia}T00:00:00Z`);
  if (!Number.isFinite(alvo)) return dia;
  const hoje = Date.parse(`${diaUtc(agoraMs)}T00:00:00Z`);
  const diferenca = Math.round((hoje - alvo) / DIA_MS);
  if (diferenca === 0) return 'Today';
  if (diferenca === 1) return 'Yesterday';
  const d = new Date(alvo);
  if (diferenca > 1 && diferenca < 7) return SEMANA[d.getUTCDay()];
  return `${MESES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
