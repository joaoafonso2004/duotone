/**
 * Pedir, tirar e limpar downloads -- a ordem das coisas, com as dependências
 * por parâmetro. O `descarregarFaixa.ts` liga-as às verdadeiras; o
 * `scripts/test-downloads-acoes.ts` liga-as a duplos e prende as corridas.
 *
 * As regras que isto garante:
 * - **"Download" sobre uma faixa que já está em disco só a marca**: não resolve
 *   nem descarrega nada, e por isso funciona sem rede.
 * - **O pedido fica gravado ANTES do download começar**, e se não ficar gravado
 *   não se promete nada.
 * - **Tirar a meio ganha a um download que acabe depois**: cada faixa tem uma
 *   GERAÇÃO, que muda ao tirar e ao limpar tudo. O download antigo vê-a mudar,
 *   para, e não publica -- sem isso uma conclusão atrasada punha a faixa de
 *   volta. Um download de outra pessoa da mesma faixa (a reprodução, o Smart
 *   Cache) não é tocado: quem se juntou a ele desiste da espera, mais nada
 *   (ver `esperarDownload`, em youtubeCache.ts).
 */
import type { Track } from '../types';
import type { SituacaoDoDownload } from './downloadsExplicitos';

export interface DependenciasDasAcoes {
  registar(t: Track): Promise<boolean>;
  esquecer(id: string): Promise<void>;
  esquecerTodos(): Promise<void>;
  temPedido(id: string): boolean;
  emDisco(id: string): boolean;
  marcarADescarregar(id: string, sim: boolean): void;
  semRede(): boolean;
  /** Resolve e descarrega. Atira `DOWNLOAD_ABORTED` quando `parar` diz que sim. */
  descarregar(t: Track, parar: () => boolean): Promise<void>;
  apagarFicheiro(id: string): void;
  apagarTudo(): void;
  /** `verificarCancelamentos`: quem espera pela rede pergunta já se deve parar. */
  avisarCancelamentos(): void;
  foiCancelado(erro: unknown): boolean;
  avisar(msg: string, erro: unknown): void;
}

export type ResultadoDoPedido = SituacaoDoDownload | 'nao-gravado' | 'desistiu';

export function criarAcoesDeDownload(d: DependenciasDasAcoes) {
  let contador = 0;
  let epoca = 0;
  const geracoes = new Map<string, number>();
  /** O download pedido a andar para cada faixa, com a geração em que começou. */
  const ativos = new Map<string, number>();

  const geracao = (id: string) => geracoes.get(id) ?? 0;

  async function pedir(t: Track): Promise<ResultadoDoPedido> {
    const id = t.sourceId;
    const g = geracao(id);
    const e = epoca;
    const mudou = () => geracao(id) !== g || epoca !== e || !d.temPedido(id);

    if (!(await d.registar(t))) return 'nao-gravado';
    if (mudou()) return 'desistiu';
    if (d.emDisco(id)) return 'descarregada';
    if (ativos.get(id) === g && epoca === e) return 'a-descarregar';

    ativos.set(id, g);
    d.marcarADescarregar(id, true);
    try {
      await d.descarregar(t, () => d.semRede() || mudou());
    } catch (erro) {
      if (!d.foiCancelado(erro)) d.avisar('[Download] Falha ao descarregar faixa:', erro);
    } finally {
      // Só quem ainda é o dono do lugar o larga: depois de tirar e voltar a
      // pedir, o lugar já é do pedido novo.
      if (ativos.get(id) === g) {
        ativos.delete(id);
        d.marcarADescarregar(id, false);
      }
    }
    if (mudou()) return 'desistiu';
    return d.emDisco(id) ? 'descarregada' : 'em-falta';
  }

  /** "Remove download": tira o pedido E o ficheiro. Não precisa de rede. */
  async function tirar(id: string): Promise<void> {
    geracoes.set(id, ++contador);
    if (ativos.delete(id)) d.marcarADescarregar(id, false);
    d.avisarCancelamentos();
    await d.esquecer(id);
    d.apagarFicheiro(id);
  }

  /** "Clear YouTube cache" e "Remover tudo": pedidos, proteção e ficheiros. */
  async function limparTudo(): Promise<void> {
    epoca++;
    for (const id of ativos.keys()) d.marcarADescarregar(id, false);
    ativos.clear();
    d.avisarCancelamentos();
    await d.esquecerTodos();
    d.apagarTudo();
  }

  /**
   * O botão dos menus. Uma faixa descarregada ou a descarregar sai; o resto
   * (incluindo um pedido em falta) pede. Um toque não desfaz o anterior por
   * acidente: depois de "Download" o menu já diz "Cancel download".
   */
  async function alternar(t: Track, situacao: SituacaoDoDownload): Promise<void> {
    if (situacao === 'descarregada' || situacao === 'a-descarregar') await tirar(t.sourceId);
    else await pedir(t);
  }

  return { pedir, tirar, limparTudo, alternar };
}
