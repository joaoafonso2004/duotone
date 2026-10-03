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
/**
 * Com a app À FRENTE (3/10): o telemóvel aquecia mais do que na 4.2.0 e não
 * havia números para dizer porquê. Um retrato de 5 em 5 minutos com a app
 * aberta, e o período até ir para trás.
 */
let periodosAFrente: readonly Periodo[] = [];
let ultimoAFrente: Retrato | null = null;
const INTERVALO_A_FRENTE_MS = 5 * 60_000;

function fecharPeriodoAFrente(r: Retrato | null): void {
  if (!r) return;
  const antes = ultimoAFrente;
  ultimoAFrente = r;
  if (!antes) return;
  const p = compararRetratos(antes, r);
  const novos = guardarPeriodo(periodosAFrente, p);
  if (novos === periodosAFrente || !p) return;
  periodosAFrente = novos;
  registar('primeiro_plano', dadosDoEvento(p));
}

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
  void tirarRetrato().then((r) => { if (AppState.currentState === 'active') ultimoAFrente = r; }).catch(() => {});
  // Só com a app à frente: desliga-se ao ir para trás e volta ao voltar.
  let relogio: ReturnType<typeof setInterval> | null = null;
  const ligarRelogio = () => {
    if (relogio) return;
    relogio = setInterval(() => { void tirarRetrato().then(fecharPeriodoAFrente).catch(() => {}); }, INTERVALO_A_FRENTE_MS);
  };
  const desligarRelogio = () => { if (relogio) clearInterval(relogio); relogio = null; };
  if (AppState.currentState === 'active') ligarRelogio();
  const aMudar = AppState.addEventListener('change', (estado) => {
    if (estado === 'active') ligarRelogio(); else desligarRelogio();
    if (estado === 'background') {
      if (!inicio) {
        inicio = tirarRetrato();
        // O retrato de ir para trás fecha também o período à frente.
        void inicio.then((r) => { fecharPeriodoAFrente(r); ultimoAFrente = null; }).catch(() => {});
      }
    } else if (estado === 'active' && inicio) {
      const antes = inicio;
      inicio = null;
      void Promise.all([antes, tirarRetrato()]).then(([a, b]) => {
        ultimoAFrente = b;
        if (!a || !b) return;
        const p = compararRetratos(a, b);
        const novos = guardarPeriodo(periodos, p);
        if (novos === periodos || !p) return;
        periodos = novos;
        registar('segundo_plano', dadosDoEvento(p));
      }).catch(() => {});
    }
  });
  return () => { ligado = false; aMudar.remove(); desligarRelogio(); };
}

/** A secção para o relatório de reprodução (com a app à frente e atrás). */
export function textoDaEnergiaAgora(): string {
  return `${textoDaEnergia(periodosAFrente, Date.now(), true)}\n${textoDaEnergia(periodos, Date.now())}`;
}
