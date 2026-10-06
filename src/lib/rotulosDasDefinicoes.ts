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
  velocidade: 'Playback speed',
  temporizador: 'Sleep timer',
  autoplay: 'Autoplay similar music',
  radioAoTocar: 'Start Radio from a song',
  equalizador: 'Equaliser',
  acento: 'Accent',
  duracao: 'Song length in lists',
  recuo: '15-second rewind',
  mensagens: 'Message notifications',
  recomendacoes: 'Recommendations',
  identificar: 'Identify library',
  libraryCheck: 'Library check',
  email: 'Email',
  reporPassword: 'Reset password',
  sair: 'Sign out',
  apagarConta: 'Delete account',
  versao: 'Version',
} as const;
