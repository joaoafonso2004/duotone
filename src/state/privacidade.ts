import { create } from 'zustand';
import { registar } from '../lib/eventos';
import { getEscutaPrivada, setEscutaPrivada } from '../lib/prefs';

/**
 * A escuta privada deste aparelho, numa store e não só na preferência.
 *
 * Três sítios têm de reagir ao mesmo tempo quando muda -- a presença dos
 * amigos (lib/presenceSync), o Discord no PC e o indicador no leitor --, e
 * nenhum deles pode ficar à espera de reler o AsyncStorage para saber.
 */
type Estado = {
  privada: boolean;
  /**
   * Já se leu a preferência. Até lá NÃO se sabe se a pessoa é privada, e quem
   * publica tem de esperar: publicar a faixa e só depois descobrir que não se
   * devia era exatamente a fuga que isto existe para impedir.
   */
  carregada: boolean;
};

export const usePrivacidade = create<Estado>(() => ({ privada: false, carregada: false }));

let aCarregar: Promise<void> | null = null;

/** Lê a preferência uma vez. Pode chamar-se de todo o lado: só a primeira lê. */
export function garantirPrivacidade(): Promise<void> {
  if (usePrivacidade.getState().carregada) return Promise.resolve();
  aCarregar ??= getEscutaPrivada()
    .catch(() => false)
    .then((privada) => {
      // Uma troca feita enquanto se lia ganha à leitura: foi a pessoa agora.
      if (!usePrivacidade.getState().carregada) usePrivacidade.setState({ privada, carregada: true });
    });
  return aCarregar;
}

export async function definirPrivacidade(privada: boolean): Promise<void> {
  if (usePrivacidade.getState().privada === privada && usePrivacidade.getState().carregada) return;
  usePrivacidade.setState({ privada, carregada: true });
  registar('escuta_privada_alterada', { ligada: privada });
  await setEscutaPrivada(privada).catch(() => {});
}
