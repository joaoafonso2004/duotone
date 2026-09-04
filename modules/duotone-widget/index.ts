import { requireOptionalNativeModule } from 'expo';

/**
 * Ponte para o estado que o widget do ecrã inicial lê.
 *
 * `requireOptionalNativeModule` devolve null quando o binário não traz o
 * módulo -- Android, PC, ou uma build anterior a isto existir. Nesse caso
 * tudo aqui é no-op: a app funciona na mesma, só não há widget.
 */
const nativo = requireOptionalNativeModule('DuotoneWidget');

/** Uma pessoa a ouvir alguma coisa neste momento. */
export interface AmigoAOuvir {
  /** Para abrir a conversa certa ao tocar. */
  id: string;
  nome: string;
  titulo: string;
  artista: string;
}

/**
 * O contrato entre a app e o widget.
 *
 * Está descrito aqui, num sítio só, porque o outro lado é Swift e não há
 * compilador que ligue os dois: se isto mudar sem o widget mudar, o widget
 * fica vazio em silêncio. Os nomes são curtos porque atravessam JSON a cada
 * troca de faixa.
 */
export interface EstadoDoWidget {
  /** O que está a tocar, ou null quando não há nada. */
  faixa: { titulo: string; artista: string; capa: string | null } | null;
  /** A cor que a capa deu, em "#RRGGBB". O widget tinge-se com ela. */
  cor: string | null;
  /** Quem dos amigos está a ouvir agora. Vazio é um estado legítimo. */
  amigos: AmigoAOuvir[];
  /** Quando isto foi escrito, em ms; serve para diagnóstico e evolução do contrato. */
  quando: number;
}

/** Escreve o estado e manda o widget redesenhar. */
export function escreverEstado(estado: EstadoDoWidget): void {
  try {
    nativo?.escrever(JSON.stringify(estado));
  } catch {
    // Um widget que não actualiza não pode derrubar a reprodução.
  }
}

/** Apaga o estado. Ao sair da conta, o widget não pode ficar com o que lá está. */
export function limparEstado(): void {
  try {
    nativo?.limpar();
  } catch {}
}

/**
 * Se o App Group está acessível.
 *
 * A Apple permite App Groups na conta gratuita, mas o perfil usado para
 * assinar/sideload tem de conservar esse entitlement. Isto permite detectar
 * um perfil mal gerado em vez de deixar a pessoa perante um widget vazio.
 */
export function widgetDisponivel(): boolean {
  try {
    return nativo?.disponivel() === true;
  } catch {
    return false;
  }
}
