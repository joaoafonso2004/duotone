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
  /** A língua da interface (15/11, src/i18n): English por omissão, ou Français. */
  idioma: 'Language',
  duracao: 'Song length in lists',
  recuo: '15-second rewind',
  mensagens: 'Message notifications',
  /** O outro aparelho a tocar (15/11): cada um nomeia o outro. */
  outroAparelhoNoIphone: 'Show what your PC is playing',
  outroAparelhoNoPc: 'Show what your iPhone is playing',
  /** As Liked Songs no iPhone (15/11), todas e as que vierem. */
  descarregarGostadas: 'Download Liked Songs',
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
  /** O relato com uma descrição (15/11), que chega ao João (supabase/relatar-problema.sql). */
  relatarProblema: 'Report a problem',
  /** Uma cópia da biblioteca em JSON e CSV (16/11, lib/exportarBiblioteca.ts). */
  exportarBiblioteca: 'Export library',
  /** As doações (11/11): o Ko-fi do João, para pagar o servidor. */
  apoiar: 'Support Duotone',
} as const;

/** A página de doações (11/11): o que entra paga o plano do Supabase. */
export const ENDERECO_DO_APOIO = 'https://ko-fi.com/zjoaoafonso';

/**
 * Onde vive a página de privacidade e termos (11/11): no portfólio, de onde
 * também vêm os downloads (`public/duotone/privacy.html` no repositório dele).
 */
export const ENDERECO_DA_PRIVACIDADE = 'https://joaoafonso.vercel.app/duotone/privacy';
