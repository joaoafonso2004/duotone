import { useState } from 'react';
import { mandarComando } from './connectSync';
import { avisoDoPedido, type TipoDePedido } from './duotoneConnect';
import { deviceLabel, type RemoteSession } from './handoff';

/**
 * Comandar o outro aparelho (⏮ ⏯ ⏭) a partir do aviso, do cartão do PC e da
 * folha e do mini do iPhone (1/11). Correr bem vê-se no próprio sítio, que muda
 * pelo Realtime; só se escreve alguma coisa quando corre mal, e some ao fim de
 * 5 s.
 */
export function useComandarOutro(sessao: RemoteSession | null): {
  comandar: (tipo: TipoDePedido) => void;
  aMandar: boolean;
  aviso: string;
} {
  const [aMandar, setAMandar] = useState(false);
  const [aviso, setAviso] = useState('');
  const comandar = (tipo: TipoDePedido) => {
    if (!sessao) return;
    setAMandar(true);
    void mandarComando(sessao.deviceId, tipo).then((estado) => {
      setAMandar(false);
      if (estado === 'feito') { setAviso(''); return; }
      setAviso(avisoDoPedido(estado, deviceLabel(sessao), tipo));
      setTimeout(() => setAviso(''), 5000);
    });
  };
  return { comandar, aMandar, aviso };
}
