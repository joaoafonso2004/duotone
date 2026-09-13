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

/**
 * O que desta lista ainda NÃO está na fila partilhada.
 *
 * Dentro de um jam, tocar numa música semeia o RESTO da lista de onde ela veio
 * (ver o `playTrack`): é o que impede a sessão de parar no fim da primeira. Só
 * que tocar três músicas do mesmo álbum semeava o álbum três vezes, e a fila de
 * toda a gente enchia-se das mesmas trinta -- foi o que o João viu a 13/9,
 * com a lista do jam a não acabar mais.
 *
 * A faixa que está A TOCAR também conta como "já lá está": ela acabou de ser
 * anunciada e não volta para o fim da fila. E a lista também se limpa a si
 * própria -- a mesma música duas vezes numa playlist entra uma só.
 *
 * A chave entra por parâmetro (o `trackKey`) para este ficheiro continuar sem
 * imports de runtime, como o `lib/radio.ts`.
 */
export function porSemear(
  tracks: readonly Track[],
  sessao: { fila: readonly { track: Track }[]; track: Track | null } | null,
  chave: (t: Track) => string,
): Track[] {
  if (!sessao) return [];
  const jaLa = new Set(sessao.fila.map((i) => chave(i.track)));
  if (sessao.track) jaLa.add(chave(sessao.track));
  const saida: Track[] = [];
  for (const t of tracks) {
    const k = chave(t);
    if (jaLa.has(k)) continue;
    jaLa.add(k);
    saida.push(t);
  }
  return saida;
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

/** Fisher-Yates, com o gerador injectável para o teste não depender da sorte. */
export function baralhada<T>(lista: readonly T[], rng: () => number = Math.random): T[] {
  const saida = [...lista];
  for (let i = saida.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [saida[i], saida[j]] = [saida[j], saida[i]];
  }
  return saida;
}

/** A ponte é registada pela store da sessão, antes dos efeitos React. */
/**
 * O percurso da sessão: o que ela já tocou, para o "anterior" ter para onde ir.
 *
 * A fila partilhada só anda para a frente -- um item é consumido quando começa
 * a tocar --, por isso dentro de um jam o botão "anterior" não tinha nada para
 * onde voltar e limitava-se a recomeçar a faixa (o João deu por isso a 13/9).
 * O percurso é do CLIENTE e vive em memória: quem entra a meio não tem passado
 * nenhum, e aí "anterior" volta a ser "recomeçar", que é a verdade.
 *
 * A regra que o mantém coerente é esta: se a faixa que ENTRA já está no
 * percurso, não se avançou, RECUOU-SE -- e o percurso corta ali. Sem isso,
 * carregar em "anterior" duas vezes andava para trás e para a frente entre as
 * mesmas duas músicas, porque o recuo também é uma mudança de faixa e
 * entrava no histórico como se fosse caminho novo.
 */
export function percursoDaSessao(
  percurso: readonly Track[],
  saiu: Track | null,
  entrou: Track | null,
  chave: (t: Track) => string,
): Track[] {
  if (!entrou) return [...percurso];
  const k = chave(entrou);
  const jaAndado = percurso.findIndex((t) => chave(t) === k);
  // Recuou: o percurso acaba onde se voltou a estar.
  if (jaAndado >= 0) return percurso.slice(0, jaAndado);
  if (!saiu || chave(saiu) === k) return [...percurso];
  return [...percurso, saiu];
}

/** Para onde o "anterior" leva, ou `null` se não há passado nesta sessão. */
export function anteriorDaSessao(percurso: readonly Track[]): Track | null {
  return percurso.length ? percurso[percurso.length - 1] : null;
}

/**
 * O que o interruptor "Queue the whole list" está a fazer AGORA.
 *
 * A regra das Definições também vale aqui: a linha de baixo diz o momento, e
 * não a regra. E muda com quem lê -- o enchimento automático só corre no
 * anfitrião, por isso só a ele se promete.
 */
export function efeitoDaAutoFila(ligado: boolean, anfitriao: boolean): string {
  if (!ligado) return 'Only the songs you pick go in.';
  return anfitriao
    ? 'Playing from a list adds the rest, and the Jam adds more when the queue runs low.'
    : 'Playing a song from a list adds the rest of the list.';
}

export type PonteJam = {
  sessao: { id: string };
  fila: readonly { track: Track }[];
  anfitriao: boolean;
  convidadosControlam: boolean;
  /** A sessão tem alguma coisa a dar. Decide se o Play de uma lista interrompe. */
  temFaixa: boolean;
  /**
   * Tocar numa música leva o resto da lista atrás.
   *
   * Isto é o gesto AUTOMÁTICO. Dar play numa lista inteira continua a pôr a
   * lista na fila com o interruptor desligado -- isso é o pedido, não um
   * acrescento.
   */
  semearAoTocar: boolean;
  /** `aSeguir` poe no topo da fila partilhada em vez do fundo. */
  sugerir: (track: Track, aSeguir?: boolean) => Promise<void>;
  semearFila: (tracks: readonly Track[]) => Promise<void>;
  anunciarFaixa: (track: Track) => Promise<void>;
  alternarPausa: () => Promise<void>;
  procurar: (ms: number) => Promise<void>;
  avancar: (automatico: boolean) => Promise<void>;
  /** Volta à anterior do percurso. `false` = não havia para onde ir. */
  recuar: () => Promise<boolean>;
  sairAoFechar: () => Promise<boolean>;
  avisarErro: () => void;
};
