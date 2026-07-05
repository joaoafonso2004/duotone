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
  SUPABASE_URL: req(
    'EXPO_PUBLIC_SUPABASE_URL',
    process.env.EXPO_PUBLIC_SUPABASE_URL
  ),
  SUPABASE_ANON_KEY: req(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ),
  SPOTIFY_CLIENT_ID: req(
    'EXPO_PUBLIC_SPOTIFY_CLIENT_ID',
    process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID
  ),
  YOUTUBE_API_KEY: req(
    'EXPO_PUBLIC_YOUTUBE_API_KEY',
    process.env.EXPO_PUBLIC_YOUTUBE_API_KEY
  ),
};
