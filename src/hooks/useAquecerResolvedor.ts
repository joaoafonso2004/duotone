import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAbertura } from '../state/abertura';
import { useConnectivity } from '../state/connectivity';

/**
 * A primeira música depois de abrir a app deixa de pagar o PO Token sozinha.
 *
 * O token vive em memória e morre com a app, e obtê-lo leva a WebView do
 * BotGuard a ficar pronta e a cunhar -- até ~27 s no pior caso. Era isso que
 * fazia a respiração durar e o download demorar a começar na primeira música
 * (13/9). Isto faz a MESMA chamada, mais cedo: ver `aquecerResolvedor`.
 *
 * - **Só no iPhone.** O leitor do PC é o IFrame oficial do YouTube e nunca
 *   passa pelo resolver.
 * - **Depois da abertura e das secções.** A animação não pode disputar o CPU
 *   (ver `useAquecerCapas`), e o que se VÊ primeiro tem prioridade sobre o que
 *   só se ouve depois -- daí o segundo e meio a mais.
 * - **Uma vez por arranque.** O token dura horas; voltar a pedi-lo a cada
 *   mudança de rede era cunhar por nada.
 *
 * Se a música for pedida enquanto isto ainda cunha, espera pelo mesmo token
 * (`fetchGvsPoToken` partilha o pedido em curso) em vez de pedir outro.
 */
export function useAquecerResolvedor(userId: string | undefined): void {
  const offline = useConnectivity((s) => s.offline);
  const naAbertura = useAbertura((s) => s.aFrente);
  const feito = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'ios' || feito.current || !userId || offline || naAbertura) return;
    const id = setTimeout(() => {
      feito.current = true;
      void import('../api/ytstream')
        .then((m) => m.aquecerResolvedor())
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, [userId, offline, naAbertura]);
}
