import { create } from 'zustand';
import { registar as registarEvento } from '../lib/eventos';
import {
  deveAvisar, INICIAL, marcarAvisado, observar, type Estado, type Observacao,
} from '../lib/saudeDaReproducao';

/**
 * O estado do aviso "a música vai parar quando o ecrã bloquear".
 *
 * A decisão vive toda em `lib/saudeDaReproducao.ts`; aqui só se guarda o
 * resultado para o banner (`components/AvisoDaReproducao.tsx`) o poder ler, e
 * se regista o episódio na analítica -- é por lá que se sabe, no SQL Editor,
 * se o YouTube fechou a porta a mais alguém além de ti.
 */
type SaudeDaReproducao = {
  estado: Estado;
  /** O aviso está à vista. Fechá-lo não esquece que já se avisou. */
  aviso: boolean;
  observar: (o: Observacao) => void;
  dispensar: () => void;
};

export const useSaudeDaReproducao = create<SaudeDaReproducao>((set, get) => ({
  estado: INICIAL,
  aviso: false,
  observar: (o) => {
    const antes = get().estado;
    let depois = observar(antes, o);
    if (depois === antes) return;
    // Voltou a tocar pela extração: o aviso deixou de ser verdade.
    let aviso = o.tipo === 'nativo' ? false : get().aviso;
    if (deveAvisar(depois)) {
      depois = marcarAvisado(depois);
      aviso = true;
      registarEvento('extracao_bloqueada', {
        faixas: depois.seguidas.length,
        tipo: o.tipo === 'falha' ? o.falha : 'n/a',
      });
    }
    set({ estado: depois, aviso });
  },
  dispensar: () => set({ aviso: false }),
}));
