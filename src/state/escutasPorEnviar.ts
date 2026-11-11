import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import {
  definirAvisoDosInicios, devolverInicios, enviarEscutasAtrasadas, enviarInicios, registarLoteDaEscuta,
  tirarIniciosPorEnviar, type ResultadoDoLote,
} from '../api/plays';
import {
  contagensEnviadas, contagensPorEnviar, definirAvisoDasContagens, enviarContagensPendentes,
} from '../lib/playCounts';
import {
  acrescentarPendente, depoisDoEnvio, lerPendentes, novaEscutaPendente, proximoLote, type EscutaPendente,
} from '../lib/escutasPendentes';
import type { Track } from '../types';
import { useAuth } from './auth';
import { useConnectivity } from './connectivity';

/**
 * A fila das escutas que não chegaram ao Supabase, no disco e por conta. As
 * decisões vivem em lib/escutasPendentes.ts; aqui é só guardar e enviar.
 *
 * A store do leitor não importa isto: recebe a função pelo
 * `definirGuardarEscutaPorEnviar` (App.tsx), como o `definirPodeTocarSemRede`.
 * Assim os testes da store não arrastam o AsyncStorage nem o Supabase.
 */

const chave = (uid: string) => `plays:pendentes:v1:${uid}`;

/** Leituras e escritas por ordem: entre ler e gravar pode entrar outra escuta. */
let porOrdem: Promise<unknown> = Promise.resolve();
function emFila<T>(f: () => Promise<T>): Promise<T> {
  const p = porOrdem.then(f, f);
  porOrdem = p.catch(() => {});
  return p;
}

async function ler(uid: string): Promise<EscutaPendente[]> {
  try { return lerPendentes(await AsyncStorage.getItem(chave(uid))); } catch { return []; }
}
async function gravar(uid: string, lista: EscutaPendente[]): Promise<void> {
  if (lista.length) await AsyncStorage.setItem(chave(uid), JSON.stringify(lista));
  else await AsyncStorage.removeItem(chave(uid));
}

const contaAtual = () => useAuth.getState().session?.user.id ?? useAuth.getState().offlineUserId ?? null;

/**
 * 16/10 (logs): TODAS as escutas passam por aqui, e não só as que falharam --
 * eram dois pedidos por música ouvida (o catálogo e a escuta). Saem juntas ao
 * fim de 10 min, com 8 à espera, ou quando a app vai para trás (o iPhone pode
 * suspendê-la a seguir). No disco não se perdem.
 */
export const ESCUTAS_ESPERAM_MS = 10 * 60_000;
export const ESCUTAS_POR_LOTE = 8;
let relogioDoEnvio: ReturnType<typeof setTimeout> | null = null;

export function guardarEscutaPorEnviar(faixa: Track, em: Date, comecouEm: Date): void {
  const uid = contaAtual();
  if (!uid) return;
  void emFila(async () => {
    const lista = acrescentarPendente(await ler(uid), novaEscutaPendente(faixa, em, comecouEm));
    await gravar(uid, lista);
    return lista.length;
  }).then((quantas) => {
    if (quantas >= ESCUTAS_POR_LOTE) { void enviarEscutasPorEnviar(); return; }
    agendarEnvio();
  }).catch(() => {});
}

/**
 * Um relógio só para tudo o que é da escuta (11/11): as escutas, as músicas
 * começadas e os incrementos das contagens avisam aqui, e saem juntos ao fim
 * de `ESCUTAS_ESPERAM_MS` -- um pedido por volta com o `registar_escutas`.
 */
function agendarEnvio(): void {
  relogioDoEnvio ??= setTimeout(() => { relogioDoEnvio = null; void enviarEscutasPorEnviar(); }, ESCUTAS_ESPERAM_MS);
}

let aEnviar = false;

/**
 * Sem o `registar_escutas` no servidor (o SQL por correr), volta-se a tentar
 * ao fim deste tempo: o João pode corrê-lo com a app aberta (no PC, o dia todo).
 */
export const SEM_FUNCAO_ESPERA_MS = 6 * 60 * 60_000;
let semFuncaoDesde: number | null = null;

/**
 * Tudo o que é da escuta num pedido (`registar_escutas`, 11/11): as começadas,
 * um lote de escutas e os incrementos das contagens. Com mais escutas à espera
 * (dias sem rede), um pedido por lote. Nada à espera, nenhum pedido.
 */
async function enviarNumPedido(uid: string): Promise<ResultadoDoLote> {
  let comecadas = tirarIniciosPorEnviar(uid);
  // Um teto de voltas: uma fila que não encolhe não pode prender isto.
  for (let volta = 0; volta < 50; volta++) {
    const escutas = proximoLote(await emFila(() => ler(uid)));
    const pendentes = await contagensPorEnviar();
    const contagens = pendentes?.uid === uid ? pendentes.contagens : [];
    if (!escutas.length && !comecadas.length && !contagens.length) {
      // Uma conta por migrar (a primeira vez neste aparelho) migra como antes.
      if (!pendentes) await enviarContagensPendentes().catch(() => {});
      return 'feito';
    }
    let r: ResultadoDoLote;
    try {
      r = await registarLoteDaEscuta({ escutas, comecadas, contagens });
    } catch {
      r = 'falhou';
    }
    if (r !== 'feito') {
      devolverInicios(uid, comecadas);
      // Sem a função, as escutas não contam como tentativa: vão já pelo caminho de antes.
      if (r === 'falhou' && escutas.length) await emFila(async () => gravar(uid, depoisDoEnvio(await ler(uid), escutas, false)));
      return r;
    }
    if (escutas.length) await emFila(async () => gravar(uid, depoisDoEnvio(await ler(uid), escutas, true)));
    await contagensEnviadas(uid, contagens);
    comecadas = [];
  }
  return 'feito';
}

/**
 * Manda o que ficou, se houver rede e sessão.
 *
 * Primeiro num pedido só (`enviarNumPedido`). Sem a função no servidor, pelos
 * pedidos de antes, por esta ordem: as músicas começadas (`enviarInicios`),
 * que deixam os ids do catálogo na memória, depois as escutas, que já não
 * perguntam ao catálogo, e no fim os incrementos das contagens
 * (`enviarContagensPendentes`). Um lote de escutas que falha para o envio.
 */
export async function enviarEscutasPorEnviar(): Promise<void> {
  const uid = useAuth.getState().session?.user.id;
  if (!uid || aEnviar || useConnectivity.getState().offline) return;
  if (relogioDoEnvio) { clearTimeout(relogioDoEnvio); relogioDoEnvio = null; }
  aEnviar = true;
  try {
    if (semFuncaoDesde === null || Date.now() - semFuncaoDesde > SEM_FUNCAO_ESPERA_MS) {
      const r = await enviarNumPedido(uid).catch((): ResultadoDoLote => 'falhou');
      if (r !== 'sem-funcao') { semFuncaoDesde = null; return; }
      semFuncaoDesde = Date.now();
    }
    await enviarInicios().catch(() => {});
    let correu = true;
    for (;;) {
      const lote = proximoLote(await emFila(() => ler(uid)));
      if (!lote.length) break;
      correu = await enviarEscutasAtrasadas(lote);
      // A conta pode ter mudado durante o envio: grava-se na da escuta.
      await emFila(async () => gravar(uid, depoisDoEnvio(await ler(uid), lote, correu)));
      if (!correu) break;
    }
    // Uma escuta que falhou diz que a rede ou o servidor não estão lá: as
    // contagens esperam pela próxima volta em vez de gastar outro pedido.
    if (correu) await enviarContagensPendentes().catch(() => {});
  } finally {
    aEnviar = false;
  }
}

/** Envia no arranque, quando a rede volta, quando a sessão chega e quando a app volta à frente. */
export function instalarEnvioDeEscutas(): () => void {
  const enviar = () => { void enviarEscutasPorEnviar(); };
  const rede = useConnectivity.subscribe((s, antes) => { if (antes.offline && !s.offline) enviar(); });
  const sessao = useAuth.subscribe((s, antes) => { if (s.session && s.session !== antes.session) enviar(); });
  // A ir para trás também: o iPhone pode suspender a app logo a seguir.
  const frente = AppState.addEventListener('change', (estado) => { if (estado === 'active' || estado === 'background') enviar(); });
  // As começadas e as contagens deixam de ter relógio próprio: vão com isto.
  definirAvisoDosInicios((ja) => { if (ja) enviar(); else agendarEnvio(); });
  definirAvisoDasContagens(agendarEnvio);
  enviar();
  return () => {
    rede(); sessao(); frente.remove();
    definirAvisoDosInicios(null);
    definirAvisoDasContagens(null);
  };
}
