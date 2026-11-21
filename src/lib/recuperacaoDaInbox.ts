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
/**
 * Sem o Realtime e com a app ESCONDIDA (só o PC lê assim, para a barra de
 * tarefas): de 5 em 5 min e não de minuto a minuto (23/10). Um PC no tabuleiro
 * o dia todo sem canal eram 60 leituras da inbox por hora, cada uma com os
 * perfis e as marcas de leitura atrás.
 */
export const TIQUES_SEM_REALTIME_ESCONDIDA = 20;
/**
 * Com Realtime e a app à frente: uma a cada 35 minutos (eram cinco até 6/10 e
 * quinze até 20/11, os logs do Supabase). Com o canal ligado, a atualização
 * inteira do Social já corre de 30 em 30 min e lê a inbox -- o que põe este
 * contador a zero --, por isso a de quinze era uma segunda leitura da mesma
 * coisa (~8 pedidos por hora por aparelho à vista). Com 35 fica só como rede
 * para quando a atualização inteira não corre.
 */
export const TIQUES_COM_REALTIME = 140;

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
  return m.tiques >= (m.visivel ? TIQUES_SEM_REALTIME : TIQUES_SEM_REALTIME_ESCONDIDA);
}
