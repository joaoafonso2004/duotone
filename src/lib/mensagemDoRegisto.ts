/**
 * A frase que quem cria conta vê quando o servidor recusa o registo (15/11).
 *
 * Com a app pública, o registo pode ser fechado por uns tempos no painel do
 * Supabase (Authentication → Sign In / Providers → "Allow new users to sign
 * up"), para a base não crescer de repente. O servidor responde então
 * "Signups not allowed for this instance" (código `signup_disabled`), que não
 * diz nada a quem chega e parece um erro da app. Os outros erros (email
 * inválido, palavra-passe curta) já vêm em frases que se percebem, e passam
 * como estão.
 *
 * Sem imports: `scripts/test-mensagem-do-registo.ts`.
 */

export const REGISTO_FECHADO = 'Sign-ups are closed for now. Try again in a few days.';

export function mensagemDoRegisto(
  erro: { message?: string | null; code?: string | null } | null | undefined,
): string | null {
  if (!erro) return null;
  const texto = erro.message ?? '';
  if (erro.code === 'signup_disabled' || /sign-?ups? (are )?not allowed/i.test(texto)) return REGISTO_FECHADO;
  return texto || "Couldn't create the account. Try again.";
}
