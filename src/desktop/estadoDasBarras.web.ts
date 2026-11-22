import { create } from 'zustand';
import {
  AMIGOS, LATERAL, PAINEL, PAINEL_DO_AMIGO, ajustar, lateralRecolhida, lerFracaoDosAmigos, lerLarguras, lerPainelDoAmigo, limitesDaLateral,
  limitesDoPainel, limitesDoPainelDoAmigo, type Limites,
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
/** A altura dos amigos na lateral (20/11): uma fração da zona dos amigos e dos atalhos. */
const PREFERENCIA_DOS_AMIGOS = 'duotone:altura-dos-amigos';
const LIMITES_DA_ESCOLHA = { minima: LATERAL.minima, maxima: LATERAL.maxima, recolhida: LATERAL.recolhida };

function lerPreferencia() {
  let guardado: unknown = null;
  try { guardado = JSON.parse(window.localStorage.getItem(PREFERENCIA) ?? 'null'); } catch { /* sem armazenamento: os de origem */ }
  const { lateral, painel } = lerLarguras(guardado);
  let amigos: unknown = null;
  try { amigos = JSON.parse(window.localStorage.getItem(PREFERENCIA_DOS_AMIGOS) ?? 'null'); } catch { /* idem */ }
  return {
    lateral: ajustar(lateral, LIMITES_DA_ESCOLHA),
    painel: ajustar(painel, { minima: PAINEL.minima, maxima: PAINEL.maxima }),
    amigos: lerFracaoDosAmigos(amigos),
    // O painel do amigo no Social (22/11, a B4): no mesmo guardado, como a lateral e o da fila.
    painelDoAmigo: lerPainelDoAmigo(guardado),
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
  /** A fração da zona de baixo da lateral que os amigos podem ocupar (o resto é dos atalhos). */
  amigos: number;
  /** A largura do painel do amigo no Social (B4, 22/11). */
  painelDoAmigo: number;
  definirLateral: (pedida: number) => void;
  definirPainel: (pedida: number) => void;
  /** Já em fração (`fracaoDosAmigos`): os limites dependem da zona, que só a pega mede. */
  definirAmigos: (fracao: number) => void;
  reporLateral: () => void;
  reporPainel: () => void;
  reporAmigos: () => void;
  definirPainelDoAmigo: (pedida: number) => void;
  reporPainelDoAmigo: () => void;
}>((set) => ({
  ...lerPreferencia(),
  definirLateral: (pedida) => set({ lateral: ajustar(pedida, limitesAgora.lateral()) }),
  definirPainel: (pedida) => set({ painel: ajustar(pedida, limitesAgora.painel()) }),
  definirAmigos: (fracao) => set({ amigos: lerFracaoDosAmigos(fracao) }),
  reporLateral: () => set({ lateral: LATERAL.padrao }),
  reporPainel: () => set({ painel: PAINEL.padrao }),
  reporAmigos: () => set({ amigos: AMIGOS.padrao }),
  definirPainelDoAmigo: (pedida) => set({ painelDoAmigo: ajustar(pedida, limitesDoPainelDoAmigo()) }),
  reporPainelDoAmigo: () => set({ painelDoAmigo: PAINEL_DO_AMIGO.padrao }),
}));

/** A lateral está na régua de ícones? É o único bit que redesenha alguma coisa ao arrastar. */
export const useLateralRecolhida = () => useBarras((s) => lateralRecolhida(s.lateral));

function aplicar(): void {
  if (typeof document === 'undefined') return;
  const { lateral, painel } = larguraEfetiva(useBarras.getState());
  const raiz = document.documentElement.style;
  raiz.setProperty('--dt-lateral', `${lateral}px`);
  raiz.setProperty('--dt-painel', `${painel}px`);
  raiz.setProperty('--dt-painel-amigo', `${useBarras.getState().painelDoAmigo}px`);
  raiz.setProperty('--dt-amigos', `${Math.round(useBarras.getState().amigos * 1000) / 10}%`);
}

if (typeof window !== 'undefined') {
  aplicar();
  useBarras.subscribe((s) => {
    aplicar();
    try { window.localStorage.setItem(PREFERENCIA, JSON.stringify({ lateral: s.lateral, painel: s.painel, amigo: s.painelDoAmigo })); } catch { /* sem armazenamento, continua a funcionar */ }
    try { window.localStorage.setItem(PREFERENCIA_DOS_AMIGOS, JSON.stringify(s.amigos)); } catch { /* idem */ }
  });
  window.addEventListener('resize', aplicar);
}
