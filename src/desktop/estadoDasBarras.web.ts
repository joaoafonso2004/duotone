import { create } from 'zustand';
import {
  LATERAL, PAINEL, ajustar, lateralRecolhida, lerLarguras, limitesDaLateral, limitesDoPainel, type Limites,
} from '../lib/largurasDasBarras';

/**
 * As larguras da lateral e do painel da fila (31/10, `lib/largurasDasBarras.ts`): o que a pessoa
 * escolheu, guardado no aparelho. **A página não lê isto: lê duas variáveis de CSS**
 * (`--dt-lateral` e `--dt-painel`, na raiz). Arrastar muda a largura a cada fotograma e, se
 * passasse pelo React, redesenhava a casca, a fila e a lateral inteiras para mexer num número; assim
 * só o navegador arruma a página. A store existe para guardar, para repor, e para dizer ao que
 * desenha o quê (a régua de ícones, o valor do separador para o leitor de ecrã).
 *
 * O guardado é o que se escolheu; a largura que se vê (a variável) é essa mesma já trazida para
 * dentro dos limites da janela de agora. Uma janela pequena não estraga a escolha de uma grande.
 */
const PREFERENCIA = 'duotone:largura-das-barras';
const LIMITES_DA_ESCOLHA = { minima: LATERAL.minima, maxima: LATERAL.maxima, recolhida: LATERAL.recolhida };

function lerPreferencia() {
  let guardado: unknown = null;
  try { guardado = JSON.parse(window.localStorage.getItem(PREFERENCIA) ?? 'null'); } catch { /* sem armazenamento: os de origem */ }
  const { lateral, painel } = lerLarguras(guardado);
  return {
    lateral: ajustar(lateral, LIMITES_DA_ESCOLHA),
    painel: ajustar(painel, { minima: PAINEL.minima, maxima: PAINEL.maxima }),
  };
}

const janela = () => (typeof window === 'undefined' ? 1440 : window.innerWidth);

/** A largura que se vê da lateral e do painel, na janela de agora. */
export function larguraEfetiva(escolhas: { lateral: number; painel: number }, largura = janela()): { lateral: number; painel: number } {
  const lateral = ajustar(escolhas.lateral, limitesDaLateral(largura));
  return { lateral, painel: ajustar(escolhas.painel, limitesDoPainel(largura, lateral)) };
}

export const limitesAgora = {
  lateral: (): Limites => limitesDaLateral(janela()),
  painel: (): Limites => limitesDoPainel(janela(), larguraEfetiva(useBarras.getState()).lateral),
};

export const useBarras = create<{
  lateral: number;
  painel: number;
  definirLateral: (pedida: number) => void;
  definirPainel: (pedida: number) => void;
  reporLateral: () => void;
  reporPainel: () => void;
}>((set) => ({
  ...lerPreferencia(),
  definirLateral: (pedida) => set({ lateral: ajustar(pedida, limitesAgora.lateral()) }),
  definirPainel: (pedida) => set({ painel: ajustar(pedida, limitesAgora.painel()) }),
  reporLateral: () => set({ lateral: LATERAL.padrao }),
  reporPainel: () => set({ painel: PAINEL.padrao }),
}));

/** A lateral está na régua de ícones? É o único bit que redesenha alguma coisa ao arrastar. */
export const useLateralRecolhida = () => useBarras((s) => lateralRecolhida(s.lateral));

function aplicar(): void {
  if (typeof document === 'undefined') return;
  const { lateral, painel } = larguraEfetiva(useBarras.getState());
  const raiz = document.documentElement.style;
  raiz.setProperty('--dt-lateral', `${lateral}px`);
  raiz.setProperty('--dt-painel', `${painel}px`);
}

if (typeof window !== 'undefined') {
  aplicar();
  useBarras.subscribe((s) => {
    aplicar();
    try { window.localStorage.setItem(PREFERENCIA, JSON.stringify({ lateral: s.lateral, painel: s.painel })); } catch { /* sem armazenamento, continua a funcionar */ }
  });
  window.addEventListener('resize', aplicar);
}
