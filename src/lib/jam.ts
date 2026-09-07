import type { Track } from '../types';

/** Numa sessão, fila vazia significa esperar; nunca recorrer à fila pessoal. */
export function proximaFaixa(
  sessao: { fila: readonly { track: Track }[] } | null,
  proximaLocal: () => Track | null,
): Track | null {
  return sessao ? sessao.fila[0]?.track ?? null : proximaLocal();
}

/**
 * Dentro de uma sessão anda toda a gente a 1x, e não é uma preferência: é o
 * que o modelo do servidor exige.
 *
 * A posição de uma sessão é `started_at` mais o tempo que passou no RELÓGIO --
 * tempo de parede. Essa conta só é a posição do áudio se o áudio andar a 1x.
 * Um ouvinte a 0,9x fica cada vez mais atrasado em relação à conta, para
 * sempre, e nada nesta app consegue corrigir isso: dez segundos de música dão
 * um segundo de atraso, e o próximo minuto dá outros seis.
 *
 * Equivaler à velocidade do anfitrião em vez de forçar 1x era possível, mas
 * obrigava a multiplicar o tempo decorrido pela velocidade em cada sítio que
 * calcula posições, mais uma coluna nova para a transportar. Muito mais peça
 * para o mesmo fim -- e a velocidade é uma escolha de quem ouve sozinho.
 *
 * A preferência do utilizador não se perde: continua guardada, e volta assim
 * que ele sair da sessão. Só não manda no motor enquanto estiver acompanhado.
 */
export function velocidadeNaSessao(escolhida: number, emSessao: boolean): number {
  return emSessao ? 1 : escolhida;
}

export function decisaoDeControlo(
  sessao: { anfitriao: boolean; convidadosControlam: boolean } | null,
): 'local' | 'anunciar' | 'sugerir' {
  if (!sessao) return 'local';
  return sessao.anfitriao || sessao.convidadosControlam ? 'anunciar' : 'sugerir';
}

/**
 * O que vai atrás da faixa tocada, pela ordem em que a lista está.
 *
 * Dar play a meio de um álbum leva o resto do álbum, não o álbum todo outra
 * vez -- é o que acontece a ouvir sozinho, e é o que se espera aqui. A faixa
 * tocada fica de fora porque já foi anunciada como a que está a dar; deixá-la
 * entrar punha-a a tocar duas vezes seguidas.
 *
 * O limite é o mesmo do servidor. Existir dos dois lados não é repetição: aqui
 * poupa-se o envio, lá impõe-se a quem não passe por aqui.
 */
export function restoDaLista(
  lista: readonly Track[] | undefined,
  tocada: Track,
  limite = 100,
): Track[] {
  if (!lista?.length) return [];
  const mesma = (t: Track) => t.source === tocada.source && t.sourceId === tocada.sourceId;
  const i = lista.findIndex(mesma);
  // Sem a tocada lá dentro, a lista inteira é o que vem a seguir.
  return (i >= 0 ? lista.slice(i + 1) : lista).filter(t => !mesma(t)).slice(0, limite);
}

/**
 * O que de uma sessão manda no que o motor está a fazer.
 *
 * Existe porque comparar sessões por IDENTIDADE DE OBJECTO estava a cancelar
 * reproduções a meio. Cada leitura do servidor devolve um objecto novo, e uma
 * leitura acontece depois de cada comando -- incluindo depois de encher a fila.
 * Dar play numa lista mandava dois: a faixa e a fila. O segundo chegava
 * enquanto o primeiro ainda carregava o áudio, o `vigente()` dizia que já não
 * era a mesma sessão, e a aplicação desistia sem nunca chegar a mandar tocar.
 * O convidado ficava com a faixa nova no ecrã e a antiga no ouvido.
 *
 * A fila NÃO entra aqui de propósito: alguém acrescentar uma música não pode
 * interromper o que está a dar. Só o que muda o áudio conta.
 */
export function assinaturaDaSessao(
  s: {
    id: string;
    track: { source: string; sourceId: string } | null;
    aTocar: boolean;
    comecouEmServidor: number | null;
    pausadaEmMs: number | null;
  } | null,
): string | null {
  if (!s) return null;
  return [
    s.id, s.track?.source ?? '', s.track?.sourceId ?? '',
    s.aTocar, s.comecouEmServidor ?? '', s.pausadaEmMs ?? '',
  ].join('|');
}

/** A ponte é registada pela store da sessão, antes dos efeitos React. */
export type PonteJam = {
  sessao: { id: string };
  fila: readonly { track: Track }[];
  anfitriao: boolean;
  convidadosControlam: boolean;
  sugerir: (track: Track) => Promise<void>;
  semearFila: (tracks: readonly Track[]) => Promise<void>;
  anunciarFaixa: (track: Track) => Promise<void>;
  alternarPausa: () => Promise<void>;
  procurar: (ms: number) => Promise<void>;
  avancar: (automatico: boolean) => Promise<void>;
  sairAoFechar: () => Promise<boolean>;
  avisarErro: () => void;
};
