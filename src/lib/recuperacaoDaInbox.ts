/**
 * Quando é que a inbox se relê SEM um aviso do Realtime (27/9).
 *
 * Era de 15 em 15 s, sempre. E no PC também com a janela escondida no
 * tabuleiro, porque a barra de tarefas mostra as mensagens por ler; com o
 * Duotone a arrancar com o Windows, isso é o dia inteiro. Cada leitura são
 * quatro consultas, e a das mensagens (`getInboxItems`) traz TODAS as
 * recebidas e não arquivadas -- as das conversas nunca se arquivam. É o
 * suspeito principal dos 8,4 GB de egress que o Supabase cobrou a uma conta
 * com 12 utilizadores (o plano grátis dá 5).
 *
 * O Realtime é o caminho normal: cada mensagem nova já pede uma leitura. Isto
 * é só a rede para quando ele cai.
 *
 * Sem imports, para o teste correr em Node puro
 * (scripts/test-recuperacao-da-inbox.ts).
 */

/** O relógio da verificação. Só decide se lê; ler é mais raro. */
export const TIQUE_DA_INBOX_MS = 15_000;
/** Sem Realtime: uma leitura por minuto. */
export const TIQUES_SEM_REALTIME = 4;
/** Com Realtime e a app à frente: uma a cada cinco minutos. */
export const TIQUES_COM_REALTIME = 20;

export interface MomentoDaInbox {
  /** O canal do Realtime está `SUBSCRIBED`. */
  aoVivo: boolean;
  /** A app está à frente de quem a usa. */
  visivel: boolean;
  /** Pode ler agora (no PC também escondida; no iPhone só à frente). */
  podeLer: boolean;
  /** Tiques desde a última leitura, viesse ela de onde viesse. */
  tiques: number;
}

export function deveRelerAInbox(m: MomentoDaInbox): boolean {
  if (!m.podeLer) return false;
  // Com o Realtime ligado e a app escondida, quem avisa é ele: é assim que a
  // barra de tarefas do PC fica a par sem ler nada de minuto a minuto.
  if (m.aoVivo) return m.visivel && m.tiques >= TIQUES_COM_REALTIME;
  return m.tiques >= TIQUES_SEM_REALTIME;
}
