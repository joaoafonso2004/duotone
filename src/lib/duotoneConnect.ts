import { deviceLabel, freshnessMs, SESSION_TTL_MS, type DeviceKind, type RemoteSession } from './handoff';

/**
 * Duotone Connect: mandar a música para outro aparelho teu, e comandá-lo.
 *
 * O "continuar aqui" (`lib/handoff.ts`) PUXA -- chegas ao PC e ele oferece-se
 * para continuar o que o telemóvel tocava. Isto é o sentido contrário:
 * EMPURRAR ("Play on PC") e COMANDAR (tocar/pausa, seguinte, anterior) o
 * aparelho que está a tocar.
 *
 * A lógica está aqui, sem imports de runtime, como o resto: o transporte vive
 * em `api/comandosDeAparelho.ts` e a tabela em `supabase/duotone-connect.sql`.
 * Testado em `scripts/test-duotone-connect.ts`.
 */

/**
 * Quanto tempo uma ordem vale.
 *
 * Passado isto, quem a mandou desiste e diz que não chegou, e quem a
 * encontrasse já não a executa: receber "seguinte" dois minutos depois é
 * receber uma ordem que já ninguém quer. Trinta segundos chega para um
 * aparelho acordado responder, mesmo com rede má.
 */
export const VALIDADE_DO_PEDIDO_MS = 30_000;

/**
 * A partir de quando se considera que um aparelho já não está à escuta.
 *
 * É o mesmo teto da sessão a tocar (3 min, batimento de 90 s), e NÃO o das
 * pausadas: uma sessão em pausa vale meia hora para efeitos de "continuar
 * aqui" -- a música ainda lá está para se retomar --, mas um telemóvel que
 * fechou a app há dez minutos não executa ordem nenhuma. Confundir as duas
 * dava um botão de comando que não fazia nada.
 */
export const ACORDADO_MS = SESSION_TTL_MS;

export type TipoDePedido =
  /** "Play on…": o destino assume a sessão de quem manda. */
  | 'assumir'
  | 'tocar-pausa'
  | 'seguinte'
  | 'anterior'
  | 'pausar';

export type EstadoDoPedido = 'pendente' | 'feito' | 'recusado' | 'expirado';

export interface Pedido {
  id: string;
  deAparelho: string;
  paraAparelho: string;
  tipo: TipoDePedido;
  /** Epoch ms, no relógio de quem leu. */
  criadoEm: number;
  estado: 'pendente' | 'feito' | 'recusado';
  detalhe: string | null;
}

export interface AparelhoDisponivel {
  deviceId: string;
  /** "PC", "phone", ou o nome que o aparelho guardou. */
  nome: string;
  tipo: DeviceKind;
  aTocar: boolean;
  /** Dá para lhe mandar uma ordem agora? */
  acordado: boolean;
  /** Quando não dá, a frase que a interface mostra. */
  motivo: string | null;
}

/** O aparelho está à escuta agora -- e não só "a sessão dele ainda vale". */
export function estaAcordado(sessao: RemoteSession, agora: number = Date.now()): boolean {
  return freshnessMs(sessao, agora) <= ACORDADO_MS;
}

/**
 * Porque é que não se pode comandar, em inglês e sem jargão.
 *
 * No iPhone a razão é quase sempre a mesma e não tem volta: o iOS suspende o
 * JS em segundo plano, por isso um telemóvel com a app fechada não recebe
 * ordem nenhuma (está no CLAUDE.md, e não se contorna).
 */
export function motivoDeNaoAlcancar(tipo: DeviceKind): string {
  return tipo === 'desktop'
    ? 'Open Duotone on that PC'
    : 'Open Duotone on your iPhone';
}

/**
 * Os aparelhos a que vale a pena oferecer "Play on…", pela ordem em que fazem
 * sentido: primeiro o que está a tocar, depois o mais recente.
 *
 * Os que não estão acordados ENTRAM na lista, apagados e com o motivo à vista
 * -- é a regra dos menus: o que não se pode fazer agora diz porquê, em vez de
 * desaparecer e deixar a pessoa à procura.
 */
export function aparelhosDisponiveis(
  sessoes: readonly RemoteSession[],
  meuAparelho: string,
  agora: number = Date.now(),
): AparelhoDisponivel[] {
  return sessoes
    .filter((s) => s.deviceId && s.deviceId !== meuAparelho)
    .map((s) => {
      const acordado = estaAcordado(s, agora);
      return {
        deviceId: s.deviceId,
        nome: deviceLabel(s),
        tipo: s.deviceKind,
        aTocar: !!s.isPlaying && acordado,
        acordado,
        motivo: acordado ? null : motivoDeNaoAlcancar(s.deviceKind),
        frescura: freshnessMs(s, agora),
      };
    })
    .sort((a, b) => {
      if (a.acordado !== b.acordado) return a.acordado ? -1 : 1;
      if (a.aTocar !== b.aTocar) return a.aTocar ? -1 : 1;
      return a.frescura - b.frescura;
    })
    .map(({ frescura: _frescura, ...aparelho }) => aparelho);
}

/** O aparelho que está a tocar, se houver um -- é a quem se manda o comando. */
export function aparelhoQueToca(
  sessoes: readonly RemoteSession[],
  meuAparelho: string,
  agora: number = Date.now(),
): AparelhoDisponivel | null {
  return aparelhosDisponiveis(sessoes, meuAparelho, agora).find((a) => a.aTocar) ?? null;
}

export function pedidoExpirou(pedido: Pick<Pedido, 'criadoEm'>, agora: number = Date.now()): boolean {
  return agora - pedido.criadoEm > VALIDADE_DO_PEDIDO_MS;
}

export function estadoDoPedido(pedido: Pedido, agora: number = Date.now()): EstadoDoPedido {
  if (pedido.estado !== 'pendente') return pedido.estado;
  return pedidoExpirou(pedido, agora) ? 'expirado' : 'pendente';
}

/**
 * Executo esta ordem?
 *
 * Só se for para mim, ainda estiver pendente e não tiver expirado. A ordem
 * fica escrita na tabela, e sem o teto de validade um telemóvel que acorda
 * depois de uma hora começava a saltar faixas sozinho.
 */
export function devoExecutar(pedido: Pedido, meuAparelho: string, agora: number = Date.now()): boolean {
  return pedido.paraAparelho === meuAparelho && estadoDoPedido(pedido, agora) === 'pendente';
}

/** O que se diz a quem mandou, enquanto espera e no fim. */
export function avisoDoPedido(estado: EstadoDoPedido, nome: string, tipo: TipoDePedido): string {
  if (estado === 'pendente') return tipo === 'assumir' ? `Sending to ${nome}…` : 'Sending…';
  if (estado === 'feito') return tipo === 'assumir' ? `Playing on ${nome}` : 'Done';
  if (estado === 'recusado') return `${nome} could not do that`;
  return `${nome} did not answer. Open Duotone there and try again.`;
}
