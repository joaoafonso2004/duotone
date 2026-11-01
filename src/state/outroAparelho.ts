import { create } from 'zustand';
import type { RemoteSession } from '../lib/handoff';

/**
 * O outro aparelho a tocar (1/11, `docs/continuar-aqui-maquete.html`).
 *
 * Quem lê as sessões é o `useHandoffSession` (lib/sessionSync.ts), montado UMA
 * vez, no aviso. Ele publica aqui a oferta, e o botão da barra do PC, a
 * lingueta, o mini e a folha do iPhone leem daqui. Cada um a chamar o hook era
 * um canal do Realtime e uma leitura de segurança por cada sítio.
 */
type Estado = {
  /** A sessão que vale a pena oferecer (fresca, noutra faixa), ou null. */
  oferta: RemoteSession | null;
  /** O aviso de chegada está à vista (a oferta ainda não se viu). */
  aviso: boolean;
  /** Os aparelhos cujo aviso já se fechou (ver `vistosQueFicam`). */
  vistos: string[];
  /** O cartão (PC) ou a folha (iPhone) do outro aparelho está aberto. */
  aberto: boolean;
};

export const useOutroAparelho = create<Estado>(() => ({ oferta: null, aviso: false, vistos: [], aberto: false }));

/** O X do aviso: já se viu, e ele recolhe para o sítio que fica. */
export function verOAviso(deviceId: string): void {
  const { vistos } = useOutroAparelho.getState();
  if (!vistos.includes(deviceId)) useOutroAparelho.setState({ vistos: [...vistos, deviceId] });
}

export function abrirOutroAparelho(): void {
  if (useOutroAparelho.getState().oferta) useOutroAparelho.setState({ aberto: true });
}

export function fecharOutroAparelho(): void {
  useOutroAparelho.setState({ aberto: false });
}
