import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { escreverEstado, limparEstado, type EstadoDoWidget } from '../../modules/duotone-widget';
import { montarEstado, mudou } from '../lib/estadoDoWidget';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { useSocial } from '../state/social';
import { useTheme } from '../state/theme';

/**
 * Mantém o widget a par do que a app sabe.
 *
 * Só no iOS: é a única plataforma onde há widget, e no PC isto seria trabalho
 * a cada troca de faixa para escrever num sítio que ninguém lê.
 *
 * A cor vem do tema e não da capa directamente: assim o widget mostra
 * exactamente o mesmo tom que a app está a mostrar nesse momento, incluindo o
 * steel de quem não escolheu seguir a capa. Duas cores diferentes para a
 * mesma música, uma no widget e outra na app, seria mais estranho do que não
 * ter cor nenhuma.
 */
export function useEstadoDoWidget(): void {
  const faixa = usePlayer((s) => s.current);
  const aTocar = usePlayer((s) => s.isPlaying);
  const amigos = useSocial((s) => s.friends);
  // `theme.color` percorre os 14 passos da animação. O destino muda uma vez
  // por capa e evita acordar o WidgetKit 14 vezes pela mesma faixa.
  const cor = useTheme((s) => s.destino.color);
  const inicializado = useAuth((s) => s.initialized);
  const conta = useAuth((s) => s.session?.user.id ?? s.offlineUserId);
  const anterior = useRef<EstadoDoWidget | null>(null);
  const contaAnterior = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !inicializado) return;
    if (!conta) {
      anterior.current = null;
      contaAnterior.current = null;
      limparEstado();
      return;
    }
    // Duas contas podem estar a ouvir a mesma faixa. Ainda assim, ao trocar
    // de conta o estado tem de ser escrito outra vez com os amigos certos.
    if (contaAnterior.current && contaAnterior.current !== conta) {
      anterior.current = null;
      contaAnterior.current = conta;
      limparEstado();
      return;
    }
    if (contaAnterior.current !== conta) {
      anterior.current = null;
      contaAnterior.current = conta;
    }
    const estado = montarEstado({ faixa, aTocar, cor, amigos });
    // A presença republica-se mesmo sem nada mudar e a cor anda a interpolar
    // durante a transição. `mudou` limita o retrato social a uma escrita de
    // cinco em cinco minutos, em vez de acordar o WidgetKit a cada batimento.
    if (!mudou(anterior.current, estado)) return;
    anterior.current = estado;
    escreverEstado(estado);
  }, [faixa, aTocar, amigos, cor, conta, inicializado]);
}
