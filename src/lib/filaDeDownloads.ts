/**
 * Um download de cada vez, e uma ordem para quem espera.
 *
 * Não é cortesia com a rede: cada job reserva o ficheiro INTEIRO em memória
 * (até 256 MiB, o tecto do downloader), por isso dois em paralelo podiam pedir
 * meio giga num telemóvel. Serializar é o que baixa esse tecto para um.
 *
 * A reprodução passa à frente ENTRE BOCADOS (27/9, `cederSePreciso`). Um
 * download explícito (ou um adiantamento) a meio não falha nem recomeça:
 * larga a vaga entre dois bocados, fica com o que já tem, e volta para a fila
 * atrás da música que a pessoa escolheu. Antes a música esperava pelo fim do
 * ficheiro de outra -- numa playlist a descarregar, um toque podia esperar
 * segundos por uma faixa que ninguém estava a ouvir. Só não cede um ficheiro
 * grande (`MAX_BYTES_PARA_CEDER`): em pausa continua em memória, e dois
 * grandes ao mesmo tempo era o que este tecto veio evitar.
 *
 * E a fila NÃO PODE ENCRAVAR. Uma vaga que nunca é largada cala a app inteira
 * até alguém a reiniciar: as faixas já descarregadas tocam, as outras ficam
 * paradas em 0:00 e trocar de música não resolve nada. Aconteceu -- por isso
 * cada vaga vem com prazo, e cada uma é identificada, para uma vaga recuperada
 * não ser descontada duas vezes quando o job atrasado finalmente acabar.
 */

/**
 * - `reproducao`: a faixa que está a tocar agora. Ninguém a ultrapassa.
 * - `seguinte`: a faixa a seguir. O crossfade depende de ela estar pronta a
 *   tempo, por isso vem antes de qualquer gravação de fundo.
 * - `explicito`: o utilizador mandou guardar. Importante, mas ninguém está do
 *   outro lado à espera que o som comece.
 * - `adiantar`: as faixas depois da seguinte, preparadas por conta (ver
 *   `lib/adiantarFaixas.ts`). Ninguém pediu nada, por isso ficam atrás de tudo.
 */
export type Prioridade = 'reproducao' | 'seguinte' | 'explicito' | 'adiantar';

const ORDEM: Record<Prioridade, number> = { reproducao: 0, seguinte: 1, explicito: 2, adiantar: 3 };

const MAX_SIMULTANEOS = 1;

/**
 * Quanto tempo uma vaga pode estar ocupada antes de se assumir que o job
 * encravou. Generoso de propósito: um ficheiro grande em 4G lento demora, e
 * recuperar uma vaga a um download que ainda anda faz descarregar dois ao mesmo
 * tempo -- mau, mas muito menos mau do que a app parar até ser reiniciada.
 */
const PRAZO_DA_VAGA_MS = 4 * 60 * 1000;

let aDescarregar = 0;
let proximoBilhete = 1;
/** As vagas em curso, e o relógio que as recupera se ninguém as largar. */
const vagas = new Map<number, ReturnType<typeof setTimeout>>();
const emEspera: { ordem: number; entrar: () => void; deixarDeOuvir: () => void }[] = [];

function ocupar(): number {
  const bilhete = proximoBilhete++;
  aDescarregar++;
  vagas.set(
    bilhete,
    setTimeout(() => {
      if (vagas.delete(bilhete)) libertar();
    }, PRAZO_DA_VAGA_MS)
  );
  return bilhete;
}

function libertar(): void {
  if (aDescarregar > 0) aDescarregar--;
  emEspera.shift()?.entrar();
}

/** Devolve o bilhete da vaga. Tem de ser entregue ao `largarVez`. */
export function pedirVez(prioridade: Prioridade, signal?: AbortSignal): Promise<number> {
  if (signal?.aborted) return Promise.reject(new Error('download aborted'));
  if (aDescarregar < MAX_SIMULTANEOS) return Promise.resolve(ocupar());
  return new Promise((resolver, rejeitar) => {
    const cancelar = () => {
      const indice = emEspera.indexOf(pedido);
      if (indice < 0) return; // já recebeu a vaga; quem a recebeu é que a larga
      emEspera.splice(indice, 1);
      pedido.deixarDeOuvir();
      rejeitar(new Error('download aborted'));
    };
    const pedido = {
      ordem: ORDEM[prioridade],
      entrar: () => { pedido.deixarDeOuvir(); resolver(ocupar()); },
      deixarDeOuvir: () => signal?.removeEventListener('abort', cancelar),
    };
    signal?.addEventListener('abort', cancelar);
    emEspera.push(pedido);
    // O sort do JS é estável: entre iguais, quem pediu primeiro entra primeiro.
    emEspera.sort((a, b) => a.ordem - b.ordem);
  });
}

/**
 * Larga a vaga. Um bilhete que já não existe é ignorado -- é o caso do job que
 * acabou depois de o prazo lhe ter recuperado a vaga, e descontá-lo outra vez
 * deixaria a fila a achar que tem lugar a mais.
 */
export function largarVez(bilhete: number): void {
  const relogio = vagas.get(bilhete);
  if (relogio === undefined) return;
  clearTimeout(relogio);
  vagas.delete(bilhete);
  libertar();
}

/**
 * Acima disto um download não cede a vaga: o que já descarregou fica em memória
 * durante a pausa, e com a música escolhida a descarregar ao lado seriam dois
 * ficheiros inteiros ao mesmo tempo. 48 MB é quase uma hora de AAC a 128 kbps.
 */
export const MAX_BYTES_PARA_CEDER = 48 * 1024 * 1024;

/** Se um download com esta prioridade e este tamanho cede a vaga agora. */
export function deveCeder(prioridade: Prioridade, totalBytes: number | null): boolean {
  if (prioridade === 'reproducao' || !reproducaoAEspera()) return false;
  return !(totalBytes != null && totalBytes > MAX_BYTES_PARA_CEDER);
}

/** A reprodução está à espera de vaga. */
export function reproducaoAEspera(): boolean {
  return emEspera.some((p) => p.ordem === ORDEM.reproducao);
}

/**
 * Chamado entre dois bocados por quem tem a vaga. Se a REPRODUÇÃO está à espera
 * e este download não é dela (e não é grande), larga a vaga -- que vai direita
 * a ela, a primeira da fila -- e volta a pedir a sua, atrás. Devolve o bilhete
 * com que o download continua: o mesmo, ou o novo depois da espera.
 */
export async function cederSePreciso(
  bilhete: number,
  prioridade: Prioridade,
  totalBytes: number | null,
  signal?: AbortSignal,
): Promise<number> {
  if (!deveCeder(prioridade, totalBytes)) return bilhete;
  largarVez(bilhete);
  return pedirVez(prioridade, signal);
}

/** Só para testes e diagnóstico. */
export function estadoDaFila(): { aDescarregar: number; emEspera: number } {
  return { aDescarregar, emEspera: emEspera.length };
}

/** Só para testes: repõe a fila entre casos. */
export function limparFila(): void {
  for (const relogio of vagas.values()) clearTimeout(relogio);
  vagas.clear();
  aDescarregar = 0;
  for (const pedido of emEspera) pedido.deixarDeOuvir();
  emEspera.length = 0;
}

/** Só para testes: força o prazo de todas as vagas em curso. */
export function forcarPrazoDasVagas(): void {
  for (const [bilhete, relogio] of [...vagas]) {
    clearTimeout(relogio);
    if (vagas.delete(bilhete)) libertar();
  }
}
