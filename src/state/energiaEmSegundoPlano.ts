import { AppState } from 'react-native';
import * as Battery from 'expo-battery';
import { cpuDoProcesso } from '../../modules/duotone-diagnostico';
import {
  compararRetratos, dadosDoEvento, guardarPeriodo, lerRetrato, textoDaEnergia,
  type Periodo, type Retrato,
} from '../lib/energiaEmSegundoPlano';
import { registar } from '../lib/eventos';
import { usePlayer } from './player';

/**
 * O medidor do gasto em segundo plano no iPhone (1/10). As contas estão em
 * `lib/energiaEmSegundoPlano.ts`; aqui tira-se um retrato ao ir para trás e
 * outro ao voltar. Não acorda nada: só corre nas duas mudanças de estado.
 */

let periodos: readonly Periodo[] = [];
let ligado = false;

async function tirarRetrato(): Promise<Retrato | null> {
  const em = Date.now();
  const cru = cpuDoProcesso();
  let bateria: number | null = null;
  let aCarregar: boolean | null = null;
  try {
    const [nivel, estado] = await Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()]);
    bateria = nivel >= 0 ? nivel : null;
    aCarregar = estado === Battery.BatteryState.CHARGING || estado === Battery.BatteryState.FULL;
  } catch {
    // Sem bateria não se sabe; o CPU continua a valer.
  }
  return lerRetrato(cru, { em, bateria, aCarregar, aTocar: usePlayer.getState().isPlaying });
}

/** Liga o medidor. Uma vez por arranque; o `App.tsx` chama-o só no iPhone. */
export function iniciarEnergiaEmSegundoPlano(): () => void {
  if (ligado) return () => {};
  ligado = true;
  let inicio: Promise<Retrato | null> | null = null;
  const aMudar = AppState.addEventListener('change', (estado) => {
    if (estado === 'background') {
      inicio ??= tirarRetrato();
    } else if (estado === 'active' && inicio) {
      const antes = inicio;
      inicio = null;
      void Promise.all([antes, tirarRetrato()]).then(([a, b]) => {
        if (!a || !b) return;
        const p = compararRetratos(a, b);
        const novos = guardarPeriodo(periodos, p);
        if (novos === periodos || !p) return;
        periodos = novos;
        registar('segundo_plano', dadosDoEvento(p));
      }).catch(() => {});
    }
  });
  return () => { ligado = false; aMudar.remove(); };
}

/** A secção para o relatório de reprodução. */
export function textoDaEnergiaAgora(): string {
  return textoDaEnergia(periodos, Date.now());
}
