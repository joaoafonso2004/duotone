import { create } from 'zustand';
import { usePlayer } from './player';
import { definirPrivacidade, garantirPrivacidade, usePrivacidade } from './privacidade';
import type { Cena, DefinicoesDaCena, ModoDoShuffle } from '../lib/gaveta';

/**
 * As cenas da gaveta a funcionar (6.0.4, `lib/gaveta.ts`). Ligar uma guarda o
 * que cada definição tinha ANTES e aplica a cena; desligar repõe o que estava.
 * Só uma de cada vez: ligar outra desliga a primeira, para nada ficar a meio.
 * Em memória -- reabrir a app começa com todas desligadas, e as definições
 * ficam como a cena as deixou.
 */
type Antes = {
  privado?: boolean;
  temporizador?: { restanteS: number; noFim: boolean };
  velocidade?: number;
  shuffle?: ModoDoShuffle;
};

export const useCenas = create<{ ligada: string | null; antes: Antes }>(() => ({ ligada: null, antes: {} }));

const modoAtual = (): ModoDoShuffle => {
  const s = usePlayer.getState();
  return !s.shuffle ? 'off' : s.shuffleInteligente ? 'inteligente' : 'on';
};

/** O botão do leitor percorre off → on → inteligente: avança até chegar ao modo pedido. */
function porShuffle(modo: ModoDoShuffle): void {
  for (let i = 0; i < 3 && modoAtual() !== modo; i++) usePlayer.getState().toggleShuffle();
}

function porTemporizador(t: number | 'fim'): void {
  const st = usePlayer.getState();
  if (t === 'fim') st.setSleepTimerNoFimDaFaixa();
  else st.setSleepTimer(t);
}

async function aplicar(d: DefinicoesDaCena): Promise<Antes> {
  const st = usePlayer.getState();
  const antes: Antes = {};
  if (d.privado !== undefined) {
    await garantirPrivacidade();
    antes.privado = usePrivacidade.getState().privada;
    void definirPrivacidade(d.privado);
  }
  if (d.temporizador !== undefined) {
    antes.temporizador = { restanteS: st.sleepTimerTimeLeft, noFim: st.pararNoFimDaFaixa };
    porTemporizador(d.temporizador);
  }
  if (d.velocidade !== undefined) {
    antes.velocidade = st.playbackRate;
    st.setPlaybackRate(d.velocidade);
  }
  if (d.shuffle !== undefined) {
    antes.shuffle = modoAtual();
    porShuffle(d.shuffle);
  }
  return antes;
}

function repor(a: Antes): void {
  const st = usePlayer.getState();
  if (a.privado !== undefined) void definirPrivacidade(a.privado);
  if (a.temporizador) {
    if (a.temporizador.noFim) st.setSleepTimerNoFimDaFaixa();
    else st.setSleepTimer(a.temporizador.restanteS > 0 ? a.temporizador.restanteS / 60 : 0);
  }
  if (a.velocidade !== undefined) st.setPlaybackRate(a.velocidade);
  if (a.shuffle !== undefined) porShuffle(a.shuffle);
}

/** Liga a cena, ou desliga-a se já estava ligada. Devolve se ficou ligada. */
export async function alternarCena(cena: Cena): Promise<boolean> {
  const { ligada, antes } = useCenas.getState();
  if (ligada) {
    repor(antes);
    useCenas.setState({ ligada: null, antes: {} });
    if (ligada === cena.id) return false;
  }
  // Marcada antes de aplicar: dois toques seguidos não aplicam duas vezes.
  useCenas.setState({ ligada: cena.id, antes: {} });
  const guardado = await aplicar(cena.definicoes);
  if (useCenas.getState().ligada === cena.id) useCenas.setState({ antes: guardado });
  return true;
}
