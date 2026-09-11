import { presentes } from '../lib/sessaoViva';
import { visibilidade, type EstadoDaVisibilidade } from '../lib/visibilidade';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { usePrivacidade } from '../state/privacidade';

/**
 * O estado do indicador de visibilidade, lido das stores.
 *
 * O Discord entra por argumento porque só o PC o conhece -- a preferência e a
 * ponte vivem na casca do desktop, e no iPhone é sempre `false`.
 */
export function useVisibilidade(discord: boolean): EstadoDaVisibilidade {
  const sessao = useOuvirJuntos((s) => s.sessao);
  // A lista inteira e o filtro cá fora: um array novo dentro do selector
  // partia o `useSyncExternalStore` (ver a nota no BarraDaSessao).
  const membros = useOuvirJuntos((s) => s.membros);
  const privada = usePrivacidade((s) => s.privada);
  const emJam = !!sessao && !sessao.acabouEm;
  return visibilidade({
    emJam,
    pessoasNoJam: emJam ? presentes(membros, Date.now()).length : 0,
    privada,
    discord,
  });
}
