import { useEffect } from 'react';
import { ESPERA_DA_DICA_MS, posicaoDaDica, textoDaDica } from '../lib/acessibilidadeDoPc';

/**
 * As legendas dos botões de ícone do PC (20/10, Q5 da revisão de qualidade).
 *
 * O `IconButton` já tinha um nome para o leitor de ecrã, mas quem via o ecrã
 * só via o ícone: o repeat tem três estados, o shuffle dois, e o Jam, o
 * "Listen along" e o fechar leitor aprendiam-se a carregar. Agora o mesmo nome
 * aparece com o rato parado em cima (`ESPERA_DA_DICA_MS`) ou logo com o foco do
 * teclado, com o atalho quando há ("Space", "Ctrl+→").
 *
 * **Uma legenda só, no `body`, e não uma por botão.** Ouvir por delegação
 * (`pointerover`/`focusin` no documento) não custa nada a quem desenha: nenhum
 * botão ganha estado nem redesenha, e a barra do leitor redesenha a cada
 * segundo. E por estar no `body`, em `position: fixed`, nenhum `overflow:
 * hidden` a corta (a superfície principal tem um).
 *
 * Quem a quer põe `data-dica` (e `data-atalho`) pelo `comDica` do `ui.web.tsx`.
 * Esconde-se ao carregar, ao rolar, com o Escape e quando o rato sai: uma
 * legenda presa por cima do botão seguinte é pior do que nenhuma. `aria-hidden`
 * porque o nome já é o `accessibilityLabel` do botão -- lido duas vezes, não.
 */
export function useDicas(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const dica = document.createElement('div');
    dica.id = 'duotone-dica';
    dica.setAttribute('aria-hidden', 'true');
    document.body.appendChild(dica);

    let alvo: HTMLElement | null = null;
    let relogio: ReturnType<typeof setTimeout> | null = null;

    const esconder = () => {
      if (relogio) clearTimeout(relogio);
      relogio = null;
      alvo = null;
      dica.removeAttribute('data-visivel');
    };
    const mostrar = (el: HTMLElement) => {
      const { rotulo, atalho } = textoDaDica(el.dataset.dica ?? '', el.dataset.atalho);
      if (!rotulo || !el.isConnected) return;
      dica.replaceChildren(document.createTextNode(rotulo));
      if (atalho) {
        const tecla = document.createElement('kbd');
        tecla.textContent = atalho;
        dica.appendChild(tecla);
      }
      // Mede-se já escrita mas ainda invisível (`visibility: hidden` ocupa o
      // lugar), e só depois se põe no sítio e se acende.
      const b = el.getBoundingClientRect();
      const d = dica.getBoundingClientRect();
      const { x, y, lado } = posicaoDaDica(
        { x: b.left, y: b.top, largura: b.width, altura: b.height },
        { largura: d.width, altura: d.height },
        { largura: window.innerWidth, altura: window.innerHeight },
      );
      dica.style.left = `${x}px`;
      dica.style.top = `${y}px`;
      dica.setAttribute('data-lado', lado);
      dica.setAttribute('data-visivel', '');
    };
    const comDica = (t: EventTarget | null): HTMLElement | null =>
      ((t as HTMLElement | null)?.closest?.('[data-dica]') as HTMLElement | null) ?? null;

    const sobre = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = comDica(e.target);
      if (el === alvo) return;
      esconder();
      if (!el) return;
      alvo = el;
      relogio = setTimeout(() => { if (alvo === el) mostrar(el); }, ESPERA_DA_DICA_MS);
    };
    const fora = (e: PointerEvent) => { if (!e.relatedTarget) esconder(); };
    const foco = (e: FocusEvent) => {
      const el = comDica(e.target);
      // Só o foco do TECLADO: um clique também foca, e aí a legenda é ruído.
      if (!el || !el.matches(':focus-visible')) return;
      esconder();
      alvo = el;
      mostrar(el);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') esconder(); };

    document.addEventListener('pointerover', sobre);
    document.addEventListener('pointerout', fora);
    document.addEventListener('focusin', foco);
    document.addEventListener('focusout', esconder);
    document.addEventListener('pointerdown', esconder, true);
    document.addEventListener('keydown', tecla, true);
    document.addEventListener('scroll', esconder, true);
    document.addEventListener('wheel', esconder, { capture: true, passive: true });
    window.addEventListener('blur', esconder);
    return () => {
      esconder();
      document.removeEventListener('pointerover', sobre);
      document.removeEventListener('pointerout', fora);
      document.removeEventListener('focusin', foco);
      document.removeEventListener('focusout', esconder);
      document.removeEventListener('pointerdown', esconder, true);
      document.removeEventListener('keydown', tecla, true);
      document.removeEventListener('scroll', esconder, true);
      document.removeEventListener('wheel', esconder, { capture: true } as any);
      window.removeEventListener('blur', esconder);
      dica.remove();
    };
  }, []);
}
