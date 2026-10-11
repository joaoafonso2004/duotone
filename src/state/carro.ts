import { AppState } from 'react-native';
import { create } from 'zustand';
import {
  addAudioOutputChangedListener, lerSaidaDeAudio, type SaidaDeAudio,
} from '../../modules/duotone-remote-commands';
import { presetDaSaida } from '../lib/presetsDoEqualizador';
import { usePlayer } from './player';
import { usePresets } from './presets';

/**
 * Por onde sai o som, e o preset do carro por cima de tudo quando é o carro
 * (30/9).
 *
 * O iOS diz a saída a cada mudança (`modules/duotone-remote-commands`): o
 * CarPlay tem um tipo próprio, e um Bluetooth vem com o nome do aparelho, que
 * a pessoa marca uma vez como "o carro". Ao abrir a app lê-se logo, para quem
 * já entra no carro com ela fechada.
 *
 * Só informa o leitor (`_definirCarro`): não pausa nem toca nada. Fora do iOS,
 * ou num binário sem o módulo, a saída é sempre `null` e nunca se está no
 * carro.
 */
export const useSaidaDeAudio = create<{ saida: SaidaDeAudio | null }>(() => ({ saida: null }));

export function iniciarModoCarro(): () => void {
  const ler = () => useSaidaDeAudio.setState({ saida: lerSaidaDeAudio() });
  const aplicar = () => {
    const { saida } = useSaidaDeAudio.getState();
    const { memoria } = usePresets.getState();
    // O carro primeiro; senão o preset do auscultador ou da coluna (11/10).
    const p = presetDaSaida(saida, memoria);
    usePlayer.getState()._definirCarro(p ? {
      ...p.preset, onde: p.onde, aparelho: p.onde === 'aparelho' ? p.aparelho : undefined,
    } : null);
  };

  ler();
  aplicar();
  const largarSaida = addAudioOutputChangedListener((saida) => useSaidaDeAudio.setState({ saida }));
  // Com a app suspensa não chegam eventos: ao voltar, pergunta-se outra vez.
  const aoAbrir = AppState.addEventListener('change', (estado) => { if (estado === 'active') ler(); });
  // Mudar a saída, o preset do carro ou a curva dele: tudo passa por aqui.
  const largarA = useSaidaDeAudio.subscribe(aplicar);
  const largarB = usePresets.subscribe(aplicar);
  return () => {
    largarSaida();
    aoAbrir.remove();
    largarA();
    largarB();
  };
}
