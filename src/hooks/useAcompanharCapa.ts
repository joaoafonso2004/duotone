import { useEffect } from 'react';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';

/**
 * Liga a capa a tocar ao acento da app.
 *
 * Fica num hook e não dentro da loja do tema para não haver uma loja a
 * observar a outra: assim a dependência é num sítio só, à vista, e o mesmo
 * código serve o telemóvel e o PC -- os dois montam isto na sua raiz.
 *
 * Reage ao ENDEREÇO da capa e não à faixa: duas músicas do mesmo álbum têm a
 * mesma capa, e relê-la a cada troca era trabalho para chegar à mesma cor. No
 * modo steel isto não faz nada -- quem decide é o `aplicarCapa`.
 */
export function useAcompanharCapa(): void {
  const capa = usePlayer((s) => s.current?.artworkUrl ?? null);
  const modo = useTheme((s) => s.mode);
  const aplicarCapa = useTheme((s) => s.aplicarCapa);

  useEffect(() => {
    // O modo entra nas dependências para a cor aparecer mal se escolha
    // "seguir a capa", sem ser preciso esperar pela música seguinte.
    void aplicarCapa(capa);
  }, [capa, modo, aplicarCapa]);
}
