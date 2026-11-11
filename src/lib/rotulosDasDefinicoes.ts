/**
 * Os NOMES das opções das Definições, iguais no PC e no iPhone (5/10,
 * auditoria de consistência P1). A mesma opção chamava-se "Message banners"
 * num lado e "Message notifications" no outro, "Show song length in lists" e
 * "Song length in lists"... As frases do que cada opção está a fazer agora já
 * eram partilhadas (`lib/efeitoDasDefinicoes.ts`); os nomes não.
 *
 * O "Send/Save playback report" fica diferente de propósito: no iPhone vai
 * pela folha de partilha, no PC é um ficheiro. Sem imports.
 */
export const ROTULOS = {
  smartShuffle: 'Smart shuffle',
  crossfade: 'Crossfade',
  automix: 'AutoMix',
  refraoNaBarra: 'Chorus on the progress bar',
  velocidade: 'Playback speed',
  temporizador: 'Sleep timer',
  autoplay: 'Autoplay similar music',
  equalizador: 'Equaliser',
  acento: 'Accent',
  duracao: 'Song length in lists',
  recuo: '15-second rewind',
  mensagens: 'Message notifications',
  recomendacoes: 'Recommendations',
  identificar: 'Identify library',
  libraryCheck: 'Library check',
  atualizarImportadas: 'Update imported playlists',
  /** A conta do Spotify (11/11): ligar, importar, desligar. */
  contaDoSpotify: 'Spotify account',
  email: 'Email',
  reporPassword: 'Reset password',
  sair: 'Sign out',
  apagarConta: 'Delete account',
  versao: 'Version',
  /** A página de privacidade e termos (11/11), no About das duas e ao entrar. */
  privacidade: 'Privacy & terms',
} as const;

/**
 * Onde vive a página de privacidade e termos (11/11): no portfólio, de onde
 * também vêm os downloads (`public/duotone/privacy.html` no repositório dele).
 */
export const ENDERECO_DA_PRIVACIDADE = 'https://joaoafonso.vercel.app/duotone/privacy';
