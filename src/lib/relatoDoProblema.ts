/**
 * "Report a problem" nas Definições (15/11). Com a app pública, várias pessoas
 * adicionavam o João como amigo só para lhe dizer que algo falhava, e quase
 * sempre sem detalhes ("the app is crashing!!!"). Agora escrevem o que
 * aconteceu, e o relatório de reprodução vai junto se quiserem. Chega à tabela
 * `relatos` (supabase/relatar-problema.sql), que só o João lê.
 *
 * Os limites são os mesmos do servidor, que os volta a aplicar: aqui é para a
 * folha os mostrar e para não mandar 200 KB que o servidor ia cortar.
 *
 * Sem imports: `scripts/test-relato-do-problema.ts`.
 */

export const MINIMO_DO_COMENTARIO = 3;
export const MAXIMO_DO_COMENTARIO = 2000;
export const MAXIMO_DO_RELATORIO = 60_000;

const MARCA_DO_CORTE = '\n[… cut: the report was longer]';

export function podeEnviarRelato(comentario: string): boolean {
  return comentario.trim().length >= MINIMO_DO_COMENTARIO;
}

/** O relatório como vai: inteiro até ao limite; acima disso, o princípio (é lá que está o resumo). */
export function relatorioParaEnviar(texto: string | null | undefined): string | null {
  if (!texto) return null;
  if (texto.length <= MAXIMO_DO_RELATORIO) return texto;
  return texto.slice(0, MAXIMO_DO_RELATORIO - MARCA_DO_CORTE.length) + MARCA_DO_CORTE;
}

/** As frases da folha. */
export const FRASES_DO_RELATO = {
  titulo: 'Report a problem',
  explicacao: 'Tell me what happened. It goes straight to the developer.',
  placeholder: 'What were you doing, and what went wrong?',
  incluir: 'Include playback report',
  incluirDetalhe: "App version, device and what the player did recently. No passwords or messages.",
  enviar: 'Send report',
  enviado: 'Thanks! Report sent',
  falhou: "Couldn't send the report.",
} as const;
