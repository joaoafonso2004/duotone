import { registar } from '../lib/eventos';
import { ouvirFimDosDownloads, type FimDeDownload } from '../lib/youtubeCache';
import { maiorBloqueio } from '../lib/processamentoDoAudio';
import { guardarProcessamento } from './processamentoDoAudio';

/**
 * Medições que não pertencem a nenhum ecrã (relatório premium, §1.1).
 *
 * `download_terminado`: quanto um download esperou na fila, quanto demorou,
 * quantos bocados e quanto pesou -- de todos os que chegaram a começar, seja
 * a faixa a tocar, o Smart Cache, a Daily mix ou um download pedido. Sem o id
 * da faixa. No PC não há downloads e isto fica calado.
 */
export function dadosDoFimDeDownload(fim: FimDeDownload): Record<string, string | number | boolean> {
  return {
    resultado: fim.resultado,
    modo: fim.modo,
    prioridade: fim.prioridade,
    ms_na_fila: Math.round(fim.msNaFila),
    ms: Math.round(fim.msADescarregar),
    bocados: fim.bocados,
    // Arredondado a 0,1 MB: chega para a pergunta, e não identifica a faixa.
    mb: Math.round(fim.bytes / 100_000) / 10,
    url_renovado: fim.urlRenovado,
    // Quanto o fim do download prendeu o JavaScript (3/10): o que decide se o
    // processamento passa para nativo. Converter (Opus) ou corrigir (AAC) e
    // escrever, de uma vez.
    ...(fim.processamento ? {
      formato: fim.processamento.formato,
      ms_js: Math.round(maiorBloqueio(fim.processamento)),
      ms_escrever: Math.round(fim.processamento.escreverMs),
    } : {}),
  };
}

let ligadas = false;

export function ligarMedicoes(): void {
  if (ligadas) return;
  ligadas = true;
  ouvirFimDosDownloads((fim) => {
    registar('download_terminado', dadosDoFimDeDownload(fim));
    guardarProcessamento(fim);
  });
}
