import { AppState } from 'react-native';
import {
  dadosDoEventoLento, ENTRE_AMOSTRAS_MS, juntarAmostra, lerAmostra, lerHermes, registarTravao, textoDoFolego,
  TRAVAO_SENTIDO_MS, type AmostraDaMemoria, type Contexto, type Travao,
} from '../lib/folegoDoJs';
import { registar } from '../lib/eventos';
import { usePlayer } from './player';

/**
 * O medidor do fôlego do JavaScript no iPhone (1/10). As contas estão em
 * `lib/folegoDoJs.ts`; aqui mede-se, conta-se e escreve-se.
 *
 * Custa um temporizador a cada meio segundo, que não faz nada além de ver as
 * horas -- e só com a app À FRENTE (1/10): em segundo plano, a tocar com o ecrã
 * desligado, eram duas vezes por segundo a acordar o iPhone para medir travões
 * que o resumo deita fora (só conta os de app à frente). Um travão que se sente (`TRAVAO_SENTIDO_MS`) com a app à frente vai
 * para o `app_events` como `js_lento`, no máximo um a cada dez minutos, com o
 * que estava a crescer -- é por aí que se vê, sem pedir o relatório a ninguém,
 * se o atraso do botão de pausa vem com o tempo de app aberta, com a fila, com
 * as linhas montadas ou com a memória.
 */

const PASSO_MS = 500;
const ENTRE_EVENTOS_MS = 10 * 60_000;
const abertaEm = Date.now();

let travoes: readonly Travao[] = [];
// A memória de minuto a minuto (4/10, `textoDaMemoria`): uma leitura das
// estatísticas do Hermes por minuto, à boleia deste temporizador.
let memoria: readonly AmostraDaMemoria[] = [];
let ultimaAmostra = 0;
function amostrar(visivel: boolean): void {
  const a = lerAmostra((globalThis as any).HermesInternal?.getInstrumentedStats?.(), Date.now(), visivel);
  if (!a) return;
  memoria = juntarAmostra(memoria, a);
  ultimaAmostra = a.em;
}
let linhasMontadas = 0;
let ligado = false;
let ultimoEvento = 0;

/** Uma linha de lista montada (TrackRow). Devolve o que a desconta. */
export function contarLinhaMontada(): () => void {
  linhasMontadas++;
  let contada = true;
  return () => { if (contada) { contada = false; linhasMontadas--; } };
}

/**
 * Quanto demora uma mudança vazia no leitor a chegar a todos os que o ouvem.
 * Ninguém muda de estado (os seletores devolvem o mesmo), por isso não há
 * desenhos -- só o custo de os perguntar. A mediana de três.
 */
function medirAvisoDoLeitor(): number | null {
  try {
    const tempos: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      usePlayer.setState({});
      tempos.push(Date.now() - t0);
    }
    return tempos.sort((a, b) => a - b)[1];
  } catch {
    return null;
  }
}

function contexto(comAviso: boolean): Contexto {
  const hermes = lerHermes((globalThis as any).HermesInternal?.getInstrumentedStats?.());
  return {
    abertaHaMin: Math.round((Date.now() - abertaEm) / 60_000),
    fila: usePlayer.getState().queue.length,
    avisoDoLeitorMs: comAviso ? medirAvisoDoLeitor() : null,
    linhasMontadas,
    ...hermes,
  };
}

/** Liga o medidor. Uma vez por arranque; o `App.tsx` chama-o só no iPhone. */
export function iniciarMedidorDoFolego(): () => void {
  if (ligado) return () => {};
  ligado = true;
  let vivo = true;
  let timer: ReturnType<typeof setTimeout>;
  let esperado = Date.now() + PASSO_MS;
  // Uma mudança de estado da app (ir para segundo plano, voltar) não é um
  // travão: suspensa, a app não corre, e o temporizador acorda tarde ao voltar.
  let saltar = false;
  const agendar = () => {
    esperado = Date.now() + PASSO_MS;
    timer = setTimeout(passo, PASSO_MS);
  };
  const aMudar = AppState.addEventListener('change', (estado) => {
    saltar = true;
    // Um corte na memória: o par que atravessa o segundo plano não conta.
    if (estado === 'background' || estado === 'active') amostrar(estado === 'active');
    clearTimeout(timer);
    if (vivo && estado !== 'background') agendar();
  });
  const passo = () => {
    if (!vivo) return;
    const agora = Date.now();
    const atraso = Math.max(0, agora - esperado);
    const visivel = AppState.currentState === 'active';
    // Mais de 20 s preso não é JavaScript lento: é a app suspensa.
    const conta = !saltar && atraso <= 20_000;
    saltar = false;
    if (conta) travoes = registarTravao(travoes, { em: agora, ms: atraso, visivel });
    if (agora - ultimaAmostra >= ENTRE_AMOSTRAS_MS) amostrar(visivel);
    if (conta && visivel && atraso >= TRAVAO_SENTIDO_MS && agora - ultimoEvento >= ENTRE_EVENTOS_MS) {
      ultimoEvento = agora;
      registar('js_lento', dadosDoEventoLento(atraso, contexto(true)));
    }
    // Em segundo plano pára: quem o volta a ligar é o regresso à frente. O
    // 'unknown' do arranque conta como à frente.
    if (AppState.currentState !== 'background') agendar();
  };
  amostrar(AppState.currentState !== 'background');
  if (AppState.currentState !== 'background') agendar();
  return () => { vivo = false; ligado = false; clearTimeout(timer); aMudar.remove(); };
}

/** A secção para o relatório de reprodução. */
export function textoDoFolegoAgora(): string {
  return textoDoFolego(travoes, contexto(true), Date.now(), memoria);
}
