/**
 * Descarregar listas inteiras, uma música de cada vez (15/11). Ver
 * `lib/downloadDaLista.ts` para o porquê; aqui está a ordem das coisas, com as
 * dependências por parâmetro, como o `acoesDeDownload.ts`. O
 * `lib/descarregarFaixa.ts` liga-o às verdadeiras e o
 * `scripts/test-download-da-lista.ts` a duplos.
 *
 * As regras:
 * - **Uma de cada vez, pela ordem da lista, com uma pausa entre elas.** Cada
 *   música é um pedido ao YouTube a partir do iPhone de quem descarrega, e 400
 *   seguidas sem respirar parecem uma rajada (a 16/10 o YouTube travou a ligação
 *   de casa do João por menos). A que já está em disco só se marca, sem pausa.
 * - **As listas fazem fila**: uma segunda playlist espera que a primeira acabe.
 *   Pedir outra vez a mesma não a duplica.
 * - **Sem rede, espera. Em dados móveis, espera pelo Wi-Fi**, a menos que se
 *   tenha dado licença a essa lista ("Use mobile data"). Um download de uma
 *   música só, pelo menu dela, não pergunta: é uma, e foi pedida agora.
 * - **Cancelar pára já**: a música a meio perde o pedido e o ficheiro, e as que
 *   já estavam ficam (tirá-las é outro gesto, "Remove download").
 * - **Cinco falhas seguidas param o lote**: é o YouTube a recusar, e insistir
 *   só piora. O que ficou por fazer faz-se com "Download the rest".
 */
import type { Espera } from './downloadDaLista';

export const PAUSA_ENTRE_MUSICAS_MS = 1500;
export const FALHAS_SEGUIDAS_PARA_PARAR = 5;

export interface DependenciasDoLote<T> {
  id(t: T): string;
  /** Já descarregada ou a descarregar: salta-se. */
  jaTratada(t: T): boolean;
  emDisco(t: T): boolean;
  /** O "Download" de uma música (pede e descarrega). Diz se ficou em disco. */
  pedir(t: T): Promise<boolean>;
  /** O "Remove download" de uma música: tira o pedido e o ficheiro. */
  tirar(id: string): Promise<void>;
  semRede(): boolean;
  dadosMoveis(): boolean;
  /** Resolve quando a rede muda (ou ao fim de um bocado, por segurança). */
  esperarPelaRede(): Promise<void>;
  pausa(ms: number): Promise<void>;
  /** Para quem desenha: alguma coisa mudou. */
  aoMudar(): void;
}

type Lote<T> = { chave: string; faixas: readonly T[]; dadosMoveis: boolean; cancelado: boolean };

export type EstadoDoLote = {
  /** Esta lista está na fila ou a descarregar. */
  aCorrer: boolean;
  espera: Espera;
  /** O último lote desta lista parou por falhas seguidas. */
  parouPorFalhas: boolean;
};

export function criarLotesDeDownload<T>(d: DependenciasDoLote<T>) {
  const fila: Lote<T>[] = [];
  const pararamPorFalhas = new Set<string>();
  let atual: { lote: Lote<T>; id: string } | null = null;
  let correndo = false;
  /**
   * Acorda o lote que espera pela rede. A rede acorda-o sozinha; isto é para o
   * que muda sem a rede mudar: "Use mobile data" e "Cancel download" arrancam
   * ou param logo, em vez de esperarem pela próxima mudança (ou pelos 30 s).
   */
  let acordarEspera: (() => void) | null = null;
  const esperar = () => new Promise<void>((acordar) => {
    acordarEspera = acordar;
    void d.esperarPelaRede().then(acordar, acordar);
  }).finally(() => { acordarEspera = null; });

  const motivo = (lote: Lote<T>): Espera => {
    if (d.semRede()) return 'rede';
    if (d.dadosMoveis() && !lote.dadosMoveis) return 'wifi';
    return null;
  };

  function estado(chave: string): EstadoDoLote {
    const lote = fila.find((l) => l.chave === chave && !l.cancelado);
    return {
      aCorrer: !!lote,
      espera: lote ? motivo(lote) : null,
      parouPorFalhas: !lote && pararamPorFalhas.has(chave),
    };
  }

  /** Junta uma lista à fila (ou atualiza a que lá está) e põe a fila a andar. */
  function juntar(chave: string, faixas: readonly T[], { dadosMoveis = false }: { dadosMoveis?: boolean } = {}): void {
    pararamPorFalhas.delete(chave);
    const existente = fila.find((l) => l.chave === chave && !l.cancelado);
    if (existente) {
      existente.faixas = faixas;
      existente.dadosMoveis = existente.dadosMoveis || dadosMoveis;
    } else {
      fila.push({ chave, faixas, dadosMoveis, cancelado: false });
    }
    d.aoMudar();
    void correr();
  }

  /** "Use mobile data": esta lista deixa de esperar pelo Wi-Fi. */
  function permitirDadosMoveis(chave: string): void {
    const lote = fila.find((l) => l.chave === chave && !l.cancelado);
    if (!lote) return;
    lote.dadosMoveis = true;
    d.aoMudar();
    acordarEspera?.();
  }

  async function cancelar(chave: string): Promise<void> {
    const lote = fila.find((l) => l.chave === chave && !l.cancelado);
    if (!lote) return;
    lote.cancelado = true;
    fila.splice(fila.indexOf(lote), 1);
    d.aoMudar();
    acordarEspera?.();
    if (atual?.lote === lote) await d.tirar(atual.id);
  }

  async function correr(): Promise<void> {
    if (correndo) return;
    correndo = true;
    try {
      while (fila.length) {
        const lote = fila[0];
        let falhasSeguidas = 0;
        for (const t of lote.faixas) {
          if (lote.cancelado) break;
          if (d.jaTratada(t)) continue;
          while (!lote.cancelado && motivo(lote)) {
            d.aoMudar();
            await esperar();
          }
          if (lote.cancelado) break;
          const jaEmDisco = d.emDisco(t);
          atual = { lote, id: d.id(t) };
          d.aoMudar();
          let ficou = false;
          try { ficou = await d.pedir(t); } catch { ficou = false; }
          atual = null;
          if (lote.cancelado) break;
          falhasSeguidas = ficou ? 0 : falhasSeguidas + 1;
          if (falhasSeguidas >= FALHAS_SEGUIDAS_PARA_PARAR) {
            pararamPorFalhas.add(lote.chave);
            break;
          }
          if (!jaEmDisco) await d.pausa(PAUSA_ENTRE_MUSICAS_MS);
        }
        const i = fila.indexOf(lote);
        if (i >= 0) fila.splice(i, 1);
        d.aoMudar();
      }
    } finally {
      correndo = false;
      atual = null;
      d.aoMudar();
    }
  }

  return { juntar, cancelar, permitirDadosMoveis, estado };
}
