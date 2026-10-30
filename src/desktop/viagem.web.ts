/**
 * A viagem partilhada (30/10, passo 2 de `docs/PLANO-ELEVAR-PC.md`): o mosaico de
 * uma playlist voa da grelha para o cabeçalho da página dela. É a API de View
 * Transitions do Chromium (`document.startViewTransition`): o elemento que parte
 * leva o nome `portrait` e o que chega (o mosaico do cabeçalho) tem o mesmo, e o
 * navegador anima um para o outro. O resto da janela troca com um esbater curto.
 *
 * **Porque tem uma ponte e não se chama só `startViewTransition(navegar)`**: a
 * rota do PC muda numa transição do React (`mudarRota`, `RootNavigator.web.tsx`),
 * que é assíncrona -- a página nova monta-se à parte e só entra no DOM mais
 * tarde. O `startViewTransition` quer o DOM novo quando a promessa do callback
 * se cumpre, por isso a promessa fica à espera de `viagemChegou`, que a casca
 * chama quando a rota nova acaba de entrar. Se nunca chegar (a rota não mudou, a
 * página demorou), cumpre-se ao fim de `ESPERA_MAXIMA_MS` e a viagem acaba
 * sem estragar nada.
 *
 * Sem a API, com "menos movimento" ou com a janela escondida, não viaja: navega-se
 * como sempre.
 */

export const NOME_DO_RETRATO = 'portrait';
export const ESPERA_MAXIMA_MS = 2500;

let aChegar: (() => void) | null = null;

type ComViagem = Document & { startViewTransition?: (cb: () => Promise<void>) => { finished: Promise<unknown>; skipTransition: () => void } };

export function podeViajar(): boolean {
  if (typeof document === 'undefined') return false;
  if (typeof (document as ComViagem).startViewTransition !== 'function') return false;
  if (document.visibilityState !== 'visible') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Muda de página com o elemento `origem` a viajar. `mudar` é a navegação de
 * sempre. Sem origem, ou sem poder viajar, ou com outra viagem a meio, é só
 * `mudar()`.
 */
export function viajar(origem: HTMLElement | null, mudar: () => void): void {
  if (!origem || aChegar || !podeViajar()) { mudar(); return; }
  const raiz = document.documentElement;
  const limpar = () => { origem.style.removeProperty('view-transition-name'); raiz.removeAttribute('data-viagem'); aChegar = null; };
  origem.style.setProperty('view-transition-name', NOME_DO_RETRATO);
  raiz.setAttribute('data-viagem', '');
  try {
    const t = (document as ComViagem).startViewTransition!(() => new Promise<void>((cumprir) => {
      aChegar = cumprir;
      const prazo = setTimeout(cumprir, ESPERA_MAXIMA_MS);
      aChegar = () => { clearTimeout(prazo); cumprir(); };
      mudar();
    }));
    void t.finished.then(limpar, limpar);
  } catch {
    limpar();
    mudar();
  }
}

/** A casca chama-a quando uma rota nova acaba de entrar: cumpre a promessa da viagem a meio. */
export function viagemChegou(): void {
  const cumprir = aChegar;
  aChegar = null;
  cumprir?.();
}
