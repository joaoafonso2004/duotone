import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { recomendar, type EscolhasDeModelo, type Recomendacao, type SaidaDeSom } from '../lib/autoeq';
import { ePlano, normalizar } from '../lib/equalizer';
import { ganhosEmVigor, segueABase, usePlayer } from './player';
import { ouvirSaidaDeSom } from './saidaDeSom';

/**
 * O Recommended do equalizador (25/10): ligado ou não neste aparelho, o que
 * está ligado agora, e os modelos escolhidos à mão para as saídas que não
 * dizem o modelo.
 *
 * Ligado, a curva medida para a saída de agora passa a ser a base do leitor
 * (`eqRecomendado` no `state/player.ts`): vale para as faixas sem EQ próprio e
 * muda sozinha quando se troca de auscultadores. Liga-se carregando no
 * Recommended (no leitor ou nas Definições); desliga-se escolhendo outro EQ
 * padrão nas Definições.
 *
 * As duas escolhas vivem em `pref:` (o `prefsSync` leva-as para a conta), para
 * sobreviverem à reinstalação de sete em sete dias do iPhone.
 */
const CHAVE_LIGADO = 'pref:eqRecomendado';
const CHAVE_ESCOLHAS = 'pref:eqModelosDasSaidas';

type Estado = {
  ligado: boolean;
  saida: SaidaDeSom | null;
  escolhas: EscolhasDeModelo;
  recomendacao: Recomendacao;
};

export const useRecomendado = create<Estado>(() => ({
  ligado: false,
  saida: null,
  escolhas: {},
  recomendacao: recomendar(null, {}),
}));

function atualizar(parcial: Partial<Omit<Estado, 'recomendacao'>>): void {
  const s = { ...useRecomendado.getState(), ...parcial };
  const recomendacao = recomendar(s.saida, s.escolhas);
  useRecomendado.setState({ ...parcial, recomendacao });
  usePlayer.getState()._definirRecomendado(s.ligado ? recomendacao.ganhos : null);
}

export function ligarRecomendado(ligado: boolean): void {
  if (useRecomendado.getState().ligado === ligado) return;
  atualizar({ ligado });
  AsyncStorage.setItem(CHAVE_LIGADO, ligado ? '1' : '0').catch(() => {});
}

/** O modelo desta saída, à mão; `null` volta ao que o nome disser. */
export function escolherModelo(nomeDaSaida: string, modelo: string | null): void {
  const escolhas = { ...useRecomendado.getState().escolhas };
  if (modelo) escolhas[nomeDaSaida] = modelo;
  else delete escolhas[nomeDaSaida];
  atualizar({ escolhas });
  AsyncStorage.setItem(CHAVE_ESCOLHAS, JSON.stringify(escolhas)).catch(() => {});
}

/** O Recommended carregado no leitor: liga-o, e a faixa passa a segui-lo. */
export function escolherRecomendadoNaFaixa(): void {
  ligarRecomendado(true);
  usePlayer.getState().seguirORecomendado();
}

/**
 * O Recommended está escolhido na faixa que toca? Quando ela segue a base com
 * ele ligado -- ou tem exatamente a curva dele (no carro, ou de antes).
 */
export function useRecomendadoNaFaixa(): boolean {
  const ligado = useRecomendado((s) => s.ligado);
  const curva = useRecomendado((s) => s.recomendacao.ganhos);
  const segue = usePlayer(segueABase);
  const carro = usePlayer((s) => !!s.carro);
  const ganhos = usePlayer(ganhosEmVigor);
  if (ligado && segue && !carro) return true;
  const g = normalizar(ganhos);
  return !ePlano(curva) && normalizar(curva).every((v, i) => v === g[i]);
}

export function iniciarRecomendado(): () => void {
  let vivo = true;
  void (async () => {
    try {
      const [ligado, escolhas] = await Promise.all([
        AsyncStorage.getItem(CHAVE_LIGADO), AsyncStorage.getItem(CHAVE_ESCOLHAS),
      ]);
      if (!vivo) return;
      let lidas: EscolhasDeModelo = {};
      try {
        const obj = JSON.parse(escolhas ?? '{}');
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          lidas = Object.fromEntries(Object.entries(obj).filter((e): e is [string, string] => typeof e[1] === 'string'));
        }
      } catch {}
      atualizar({ ligado: ligado === '1', escolhas: lidas });
    } catch {}
  })();
  const largar = ouvirSaidaDeSom((saida) => {
    const antes = useRecomendado.getState().saida;
    if (antes?.tipo === saida?.tipo && antes?.nome === saida?.nome) return;
    atualizar({ saida });
  });
  return () => {
    vivo = false;
    largar();
  };
}
