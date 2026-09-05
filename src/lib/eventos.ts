import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';
import { APP_VERSION } from './buildInfo';

/**
 * Eventos, para deixar de adivinhar.
 *
 * A app não tinha nenhuma medição. Quando a reprodução partiu, a única fonte de
 * verdade foi uma screenshot — e isso levou a corrigir a coisa errada pelo
 * menos uma vez. Isto existe para responder a perguntas concretas: quantas
 * faixas falham a resolver, quantas caem no embed, quanto tempo demora a
 * primeira nota, que ecrãs ninguém abre.
 *
 * **Não guarda conteúdo.** Contagens e etiquetas curtas: "falhou a resolver,
 * tipo X", nunca o que a pessoa estava a ouvir, pesquisou ou escreveu. Quem
 * mexer nisto a seguir tem de manter essa linha.
 *
 * **Não tem relógio.** Junta em memória e envia quando o lote enche ou quando a
 * app sai de primeiro plano. Um temporizador a acordar a app para mandar
 * telemetria seria exactamente o que se andou a tirar daqui.
 */

export type NomeDeEvento =
  | 'app_aberta'
  | 'ecra_aberto'
  | 'faixa_iniciada'
  | 'primeira_nota'
  | 'faixa_falhou'
  | 'caiu_no_embed'
  | 'fim_encravado'
  | 'trocou_para_ficheiro'
  | 'pesquisa_feita'
  | 'faixa_guardada'
  | 'playlist_criada'
  | 'partilha_enviada';

type Evento = { nome: NomeDeEvento; dados: Record<string, string | number | boolean>; em: string };

/** Acima disto envia-se sem esperar pelo segundo plano. */
const LOTE = 20;
/** Um limite duro, para uma sessão longa sem rede não crescer sem fim. */
const MAXIMO = 200;

let utilizador: string | null = null;
let porEnviar: Evento[] = [];
let aEnviar = false;
let desligar: (() => void) | null = null;

async function enviar(): Promise<void> {
  if (!utilizador || aEnviar || !porEnviar.length) return;
  aEnviar = true;
  const lote = porEnviar;
  porEnviar = [];
  try {
    const { error } = await supabase.from('app_events').insert(
      lote.map((e) => ({
        user_id: utilizador,
        nome: e.nome,
        dados: e.dados,
        plataforma: Platform.OS,
        versao: APP_VERSION,
        em: e.em,
      })),
    );
    // Sem rede, ou sem a migração aplicada: devolve-se à fila para a próxima.
    if (error) porEnviar = [...lote, ...porEnviar].slice(-MAXIMO);
  } catch {
    porEnviar = [...lote, ...porEnviar].slice(-MAXIMO);
  } finally {
    aEnviar = false;
  }
}

/** Regista um acontecimento. Nunca lança, e nunca espera. */
export function registar(nome: NomeDeEvento, dados: Record<string, string | number | boolean> = {}): void {
  if (!utilizador) return;
  porEnviar.push({ nome, dados, em: new Date().toISOString() });
  if (porEnviar.length > MAXIMO) porEnviar = porEnviar.slice(-MAXIMO);
  if (porEnviar.length >= LOTE) void enviar();
}

/** Liga a medição a uma sessão. Devolve o `parar`. */
export function iniciarEventos(userId: string): () => void {
  utilizador = userId;
  registar('app_aberta');

  const aoMudarDeEstado = (estado: string) => { if (estado !== 'active') void enviar(); };
  const sub = AppState.addEventListener('change', aoMudarDeEstado);
  const naWeb = Platform.OS === 'web' && typeof document !== 'undefined';
  const aoEsconder = () => { if (document.visibilityState === 'hidden') void enviar(); };
  if (naWeb) document.addEventListener('visibilitychange', aoEsconder);
  desligar = () => {
    sub.remove();
    if (naWeb) document.removeEventListener('visibilitychange', aoEsconder);
  };

  return () => {
    void enviar();
    desligar?.();
    desligar = null;
    utilizador = null;
    porEnviar = [];
  };
}
