/**
 * Variáveis de ambiente da app.
 *
 * NUNCA pôr valores reais como fallback aqui. Este ficheiro vai para um
 * repositório público, e o Expo inlina tudo o que é `EXPO_PUBLIC_*` no
 * bundle — uma chave escrita aqui fica exposta duas vezes.
 *
 * Localmente vêm do `.env` (que está no .gitignore); na CI, do secret
 * `ENV_FILE`, que os workflows escrevem para `.env` antes de compilar.
 */
function req(name: string, value: string | undefined): string {
  if (!value) {
    console.warn(
      `[env] Variável em falta: ${name}. Copia .env.example para .env e preenche.`
    );
    return '';
  }
  return value;
}

export const ENV = {
  SUPABASE_URL: req('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: req(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ),
  YOUTUBE_API_KEY: req('EXPO_PUBLIC_YOUTUBE_API_KEY', process.env.EXPO_PUBLIC_YOUTUBE_API_KEY),
};
