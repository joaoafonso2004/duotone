/**
 * Os grupos de mensagens e os separadores de hora da conversa (9/10,
 * docs/PLANO-SOCIAL-IOS.md, fase 2).
 *
 * A hora ia dentro de cada balão ("11:10" três vezes seguidas). Passa a um
 * separador ao centro quando muda o dia ou passam 15 min, e as mensagens
 * seguidas da mesma pessoa juntam-se num grupo: só a última leva a ponta.
 *
 * Sem imports de runtime: testado em Node (scripts/test-grupos-de-mensagens.ts).
 */

export const INTERVALO_DO_SEPARADOR_MS = 15 * 60_000;
export const INTERVALO_DO_GRUPO_MS = 5 * 60_000;

type Mensagem = { createdAt: string; sender: { id: string } };

const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today 11:10", "Yesterday 23:40", "Mon 11:10" (esta semana), "9 Oct 11:10", "9 Oct 2025 11:10". */
export function rotuloDoSeparador(quando: number, agora: number, hora: (d: Date) => string): string {
  const d = new Date(quando);
  const h = hora(d);
  const dias = Math.round((inicioDoDia(new Date(agora)) - inicioDoDia(d)) / 86_400_000);
  if (dias <= 0) return `Today ${h}`;
  if (dias === 1) return `Yesterday ${h}`;
  if (dias < 7) return `${DIAS[d.getDay()]} ${h}`;
  const ano = d.getFullYear() !== new Date(agora).getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MESES[d.getMonth()]}${ano} ${h}`;
}

/**
 * O separador que vai POR CIMA de `atual` (null se não vai nenhum): na
 * primeira mensagem da conversa, quando o dia muda, ou depois de 15 min.
 */
export function separadorPorCima(
  atual: Mensagem,
  anterior: Mensagem | undefined,
  agora: number,
  hora: (d: Date) => string,
): string | null {
  const t = Date.parse(atual.createdAt);
  if (!Number.isFinite(t)) return null;
  const antes = anterior ? Date.parse(anterior.createdAt) : NaN;
  const mudou = !Number.isFinite(antes)
    || t - antes > INTERVALO_DO_SEPARADOR_MS
    || inicioDoDia(new Date(t)) !== inicioDoDia(new Date(antes));
  return mudou ? rotuloDoSeparador(t, agora, hora) : null;
}

/** Duas mensagens seguidas ficam no mesmo grupo: a mesma pessoa, até 5 min, sem separador entre elas. */
export function mesmoGrupo(a: Mensagem | undefined, b: Mensagem | undefined): boolean {
  if (!a || !b || a.sender.id !== b.sender.id) return false;
  const ta = Date.parse(a.createdAt), tb = Date.parse(b.createdAt);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(tb - ta) <= INTERVALO_DO_GRUPO_MS
    && inicioDoDia(new Date(ta)) === inicioDoDia(new Date(tb));
}
