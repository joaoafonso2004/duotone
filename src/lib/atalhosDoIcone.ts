/**
 * Os atalhos do ícone da app (7/10, iPhone): premir o ícone no ecrã principal.
 *
 * São ESTÁTICOS (`UIApplicationShortcutItems` no `app.json`), porque não
 * dependem de nada da conta: continuar o que se ouvia, a Daily mix e as Liked
 * Songs baralhadas. O tipo de cada um é o que o iOS devolve ao escolhê-lo
 * (`modules/duotone-atalhos`); quem o executa é o `hooks/useAtalhosDoIcone.ts`.
 * Sem imports: `scripts/test-atalhos-do-icone.ts` confere que estes tipos são
 * os do `app.json`.
 */
export type AcaoDoAtalho = 'continuar' | 'mistura-do-dia' | 'baralhar-gostadas';

export const ATALHOS_DO_ICONE: readonly { tipo: string; acao: AcaoDoAtalho; titulo: string; simbolo: string }[] = [
  { tipo: 'com.joao.duotone.continuar', acao: 'continuar', titulo: 'Resume', simbolo: 'play.fill' },
  { tipo: 'com.joao.duotone.mistura-do-dia', acao: 'mistura-do-dia', titulo: 'Daily mix', simbolo: 'sparkles' },
  { tipo: 'com.joao.duotone.baralhar-gostadas', acao: 'baralhar-gostadas', titulo: 'Shuffle Liked Songs', simbolo: 'shuffle' },
];

/** O que fazer com o tipo que o iOS mandou, ou `null` se não é nosso. */
export function acaoDoAtalho(tipo: string): AcaoDoAtalho | null {
  return ATALHOS_DO_ICONE.find((a) => a.tipo === tipo)?.acao ?? null;
}

/**
 * Os botões do ecrã bloqueado e do Centro de Controlo (10/11, iOS 18,
 * `targets/controlos`) abrem `duotone://controlo/<ação>`: as mesmas três ações.
 * `null` para qualquer outro link (o `duotone://social` segue para a navegação).
 */
export function acaoDoLink(url: string | null | undefined): AcaoDoAtalho | null {
  const m = /^duotone:\/\/controlo\/([a-z-]+)\/?(?:[?#].*)?$/.exec((url ?? '').trim());
  if (!m) return null;
  return ATALHOS_DO_ICONE.find((a) => a.acao === m[1])?.acao ?? null;
}

/** Um link dos botões do ecrã bloqueado: a navegação deixa-o passar ao lado. */
export const eLinkDeControlo = (url: string) => /^duotone:\/\/controlo\//.test(url.trim());
