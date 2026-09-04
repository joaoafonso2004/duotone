import { setRemoteCommandsEnabled } from '../../modules/duotone-remote-commands';
import { usePlayer } from '../state/player';

/**
 * Quem tem a última palavra sobre os botões do Lock Screen.
 *
 * O expo-video, no `NowPlayingManager`, volta a ligar `skipForwardCommand` e
 * `skipBackwardCommand` sempre que reconstrói os alvos do Now Playing — e
 * fá-lo em três momentos: item novo (cada `replaceAsync`), item pronto a tocar
 * (`readyToPlay`) e mudança de ritmo. O iOS dá os slots do Lock Screen aos
 * saltos de ±10 s por cima do anterior/seguinte, por isso basta uma destas
 * reconstruções escapar para os botões de faixa desaparecerem.
 *
 * Reafirmar por temporizador não chega: numa ligação lenta o `readyToPlay`
 * chega bem depois, e o watchdog que troca para o ficheiro descarregado a
 * meio da faixa não mexe em nada que o React observe. Daí este ponto único,
 * chamado a partir dos próprios eventos do player.
 */
function calcular(): [next: boolean, previous: boolean] {
  const s = usePlayer.getState();
  const temFaixa = !!s.current;
  // "Anterior" fica sempre ativo com faixa carregada: com >3 s de reprodução
  // recomeça a faixa (comportamento padrão), senão recua na fila.
  return [temFaixa && (s.queue.length > 1 || s.repeatMode === 'all' || s.shuffle), temFaixa];
}

let adiado: ReturnType<typeof setTimeout> | null = null;

/**
 * Afirma já, e outra vez pouco depois. A segunda passagem cobre o caso de o
 * expo-video ainda ter um `DispatchQueue.main.async` pendente do mesmo evento;
 * eventos seguidos partilham o temporizador em vez de o empilhar.
 */
export function reafirmarComandosDeFaixa(): void {
  setRemoteCommandsEnabled(...calcular());
  if (adiado) clearTimeout(adiado);
  adiado = setTimeout(() => {
    adiado = null;
    setRemoteCommandsEnabled(...calcular());
  }, 400);
}
