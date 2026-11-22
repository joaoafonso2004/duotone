/**
 * A recuperação da palavra-passe por código (22/11), no PC e no iPhone.
 *
 * Havia um "Forgot password?" no iPhone que não fazia nada, nenhum no PC, e o
 * "Reset password" das Definições mandava um LINK do Supabase sem destino: abria
 * o `http://localhost:3000` do painel (o "Site URL" por omissão), onde não corre
 * nada. Agora o email traz um código (o `{{ .Token }}` no modelo "Reset Password"
 * do Supabase), e tudo se faz dentro da app:
 *
 *   1. o email → `resetPasswordForEmail` (o Supabase manda o código);
 *   2. o código e a palavra-passe nova → `verifyOtp({ type: 'recovery' })` e
 *      `updateUser({ password })`, nessa ordem, com a sessão retida até ao fim
 *      (`state/auth.ts`): a app só abre depois de a palavra-passe mudar.
 *
 * O que se valida aqui e as frases dos erros do servidor. Sem imports:
 * `scripts/test-recuperacao-da-password.ts`.
 */

/** O mínimo do Supabase por omissão; o servidor tem a última palavra. */
export const PASSWORD_MINIMA = 6;

/** O código do email: só os algarismos (cola-se com espaços ou traços), de 6 a 10. */
export function limparCodigo(texto: string): string {
  return texto.replace(/\D/g, '').slice(0, 10);
}

export function normalizarEmail(texto: string): string {
  return texto.trim().toLowerCase();
}

export function erroDoEmail(texto: string): string | null {
  const email = normalizarEmail(texto);
  if (!email) return 'Enter the email of your account.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "That doesn't look like an email.";
  return null;
}

export function erroDoCodigo(texto: string): string | null {
  const codigo = limparCodigo(texto);
  if (codigo.length < 6) return 'Enter the code from the email.';
  return null;
}

export function erroDaPassword(nova: string, repetida: string): string | null {
  if (nova.length < PASSWORD_MINIMA) return `Use at least ${PASSWORD_MINIMA} characters.`;
  if (nova !== repetida) return "The two passwords don't match.";
  return null;
}

/** A frase de um erro do Supabase, em vez do texto técnico dele. */
export function mensagemDaRecuperacao(
  erro: { message?: string | null; code?: string | null; status?: number | null } | null | undefined,
): string | null {
  if (!erro) return null;
  const texto = erro.message ?? '';
  const codigo = erro.code ?? '';
  if (codigo === 'otp_expired' || /token has expired|invalid.*(otp|token)|otp.*(expired|invalid)/i.test(texto)) {
    return 'That code is wrong or has expired. Ask for a new one.';
  }
  if (codigo === 'over_email_send_rate_limit' || codigo === 'over_request_rate_limit' || erro.status === 429 || /rate limit/i.test(texto)) {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (codigo === 'same_password' || /different from the old password/i.test(texto)) {
    return 'Choose a password different from the old one.';
  }
  if (codigo === 'weak_password' || /password should be|password is too weak|leaked|pwned/i.test(texto)) {
    return 'That password is too weak. Try a longer one.';
  }
  return texto || "That didn't go through. Try again.";
}
