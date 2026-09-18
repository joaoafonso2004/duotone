import { AppState, Platform } from 'react-native';
import { APP_VERSION } from '../lib/buildInfo';
import { registar } from '../lib/eventos';
import { escreverNaGuarda, lerDaGuarda } from '../lib/guardaDaSaude';
import { lerIncidentesDoSistema } from '../lib/incidentesDoSistema';
import { registarNaSaudeDaApp } from '../lib/playbackDiagnostics';
import {
  dadosDoEvento, descreverIncidente, incidenteDaSessaoAnterior, incidenteDeErro,
  juntarIncidente, lerIncidentes, lerSessao, medidaDoArranque, nomeDoEvento,
  type Incidente,
} from '../lib/saudeDaApp';
import { useAbertura } from './abertura';

/**
 * A app a ver-se a si própria (as regras vivem em `lib/saudeDaApp.ts`).
 *
 * `instalarSaudeDaApp` corre no topo do `App.tsx`, antes de qualquer ecrã:
 *  - o que ficou da abertura anterior (a sessão que não fechou, o erro fatal,
 *    os crashes que o sistema contou) vai para a analítica -- à espera da conta,
 *    se ainda não houver (ver `eventos.ts`);
 *  - os erros daqui para a frente: o handler global do React Native no iPhone,
 *    `error`/`unhandledrejection` no PC. Um erro FATAL fica no disco, porque o
 *    processo morre a seguir; os outros seguem já;
 *  - o arranque a frio, medido quando a abertura sai.
 */

function agoraPerf(): number | null {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : null;
}

/** O mais cedo que o JS sabe: este módulo é importado no topo do App.tsx. */
const jsComecouEm = agoraPerf();

/** Um erro que se repete não pode encher a analítica. */
const MAX_POR_SESSAO = 30;
const MAX_POR_ASSINATURA = 3;
let contados = 0;
const porAssinatura = new Map<string, number>();

function guardarParaDepois(i: Incidente): void {
  const lista = juntarIncidente(lerIncidentes(lerDaGuarda('incidentes')), i);
  escreverNaGuarda('incidentes', JSON.stringify(lista));
}

function contar(i: Incidente): void {
  registarNaSaudeDaApp(descreverIncidente(i), i.quando);
  const chave = i.assinatura ?? i.tipo;
  const vistas = porAssinatura.get(chave) ?? 0;
  porAssinatura.set(chave, vistas + 1);
  if (contados >= MAX_POR_SESSAO || vistas >= MAX_POR_ASSINATURA) return;
  contados++;
  registar(nomeDoEvento(i), dadosDoEvento(i, Date.now()));
}

/** Um erro que a app apanhou e de que recuperou (a barreira de um ecrã). */
export function reportarErro(erro: unknown, onde: string): void {
  try {
    contar(incidenteDeErro(erro, { fatal: false, onde, quando: Date.now(), versao: APP_VERSION }));
  } catch {
    // A observação nunca pode ser o que parte a app.
  }
}

function marcarSessao(aberta: boolean): void {
  escreverNaGuarda('sessao', JSON.stringify({ aberta, desde: Date.now(), versao: APP_VERSION }));
}

function ouvirErros(): void {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (e) => {
      // "Script error." é um erro de outra origem (o iframe do YouTube): não
      // traz nada e não é nosso.
      if (!e.error && /^script error\.?$/i.test(String(e.message ?? ''))) return;
      reportarErro(e.error ?? e.message, 'global');
    });
    window.addEventListener('unhandledrejection', (e) => reportarErro(e.reason, 'promessa'));
    return;
  }
  const utils = (globalThis as { ErrorUtils?: {
    getGlobalHandler(): ((erro: unknown, fatal?: boolean) => void) | undefined;
    setGlobalHandler(h: (erro: unknown, fatal?: boolean) => void): void;
  } }).ErrorUtils;
  if (!utils) return;
  const anterior = utils.getGlobalHandler();
  utils.setGlobalHandler((erro, fatal) => {
    try {
      const i = incidenteDeErro(erro, { fatal: !!fatal, onde: 'global', quando: Date.now(), versao: APP_VERSION });
      if (fatal) {
        // O processo vai morrer: fica no disco para a abertura seguinte. E a
        // sessão fecha-se, para o mesmo crash não contar também como
        // "sessão interrompida".
        guardarParaDepois(i);
        marcarSessao(false);
      } else {
        contar(i);
      }
    } catch {
      // idem
    }
    anterior?.(erro, fatal);
  });
}

function lerInicioDoRuntime(): { processo: number | null; runtime: number | null } {
  try {
    const t = (performance as unknown as {
      rnStartupTiming?: { startTime?: number | null; initializeRuntimeStart?: number | null };
    }).rnStartupTiming;
    return { processo: t?.startTime ?? null, runtime: t?.initializeRuntimeStart ?? null };
  } catch {
    return { processo: null, runtime: null };
  }
}

/**
 * O arranque a frio acaba quando a abertura sai: a app está montada e a
 * sessão lida. Uma app lançada em segundo plano não tem abertura, e aí não se
 * mede nada -- ninguém esteve à espera.
 */
function medirArranque(doSistema: Promise<number | null>): void {
  let viuAbertura = useAbertura.getState().aFrente;
  const parar = useAbertura.subscribe((s) => {
    if (s.aFrente) {
      viuAbertura = true;
      return;
    }
    if (!viuAbertura) return;
    parar();
    const agora = agoraPerf();
    if (agora === null) return;
    void doSistema.then((processoComecouEm) => {
      const rn = lerInicioDoRuntime();
      // O PC diz quando o processo principal começou, em ms desde 1970;
      // passa-se para o relógio do `performance.now()`.
      const processo = processoComecouEm !== null && typeof performance.timeOrigin === 'number'
        ? processoComecouEm - performance.timeOrigin
        : rn.processo;
      const medida = medidaDoArranque({ agora, processo, runtime: rn.runtime, js: jsComecouEm });
      if (medida) registar('arranque', { ms: medida.ms, desde: medida.desde });
    });
  });
}

let instalada = false;

export function instalarSaudeDaApp(): void {
  if (instalada) return;
  instalada = true;
  try {
    // A sessão só existe no iPhone: no PC quem vê o renderer morrer é o
    // processo principal (electron/saude.cjs).
    if (Platform.OS !== 'web') {
      const interrompida = incidenteDaSessaoAnterior(lerSessao(lerDaGuarda('sessao')));
      if (interrompida) guardarParaDepois(interrompida);
      marcarSessao(AppState.currentState === 'active');
      // `inactive` também fecha: é o estado em que se mata a app no seletor.
      AppState.addEventListener('change', (estado) => marcarSessao(estado === 'active'));
    }

    const pendentes = lerIncidentes(lerDaGuarda('incidentes'));
    if (pendentes.length) escreverNaGuarda('incidentes', '[]');
    for (const i of pendentes) contar(i);

    const doSistema = lerIncidentesDoSistema().then(
      ({ incidentes, processoComecouEm }) => {
        for (const i of incidentes) contar(i);
        return processoComecouEm;
      },
      () => null,
    );
    medirArranque(doSistema);
    ouvirErros();
  } catch {
    // A observação nunca pode ser o que parte a app.
  }
}

let ultimoEcra: string | null = null;

/** `ecra_aberto`: que ecrãs se abrem (só o nome da rota, nunca os parâmetros). */
export function anotarEcra(nome: string | null | undefined): void {
  if (!nome || nome === ultimoEcra) return;
  ultimoEcra = nome;
  registar('ecra_aberto', { ecra: nome.replace(/[^\w-]/g, '').slice(0, 40) });
}
