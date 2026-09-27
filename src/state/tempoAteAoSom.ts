import { arranqueAtual } from '../lib/arranqueDaFaixa';
import { juntarArranque, type Arranque } from '../lib/tempoAteAoSom';
import { downloadsEmCurso, ouvirDownloads, type EstadoDoDownload } from '../lib/youtubeCache';

/**
 * As últimas faixas medidas do pedido ao primeiro som, para o relatório de
 * reprodução do iPhone (secção "time to first sound"). As regras e o texto
 * vivem em `lib/tempoAteAoSom.ts`; aqui junta-se o que o leitor, o resolvedor
 * e o download sabem de cada faixa. Só em memória: morre com a app, como o
 * resto do relatório.
 *
 * Os tempos do download vêm do registo dos downloads EM CURSO (que tem o id da
 * faixa), e não do evento do fim: esse não leva o id de propósito, porque é o
 * que vai para a analítica (`test-transmitir-audio.mjs` prende isso). Um
 * download que desaparece do registo acabou nesse instante.
 */
type Visto = { pedidoEm: number; inicioEm: number | null; bytes: number; prioridade: string; fimEm: number | null };

let medidas: Arranque[] = [];
const vistos = new Map<string, Visto>();
let ligado = false;

function reverDownloads(): void {
  const agora = Date.now();
  const ativos = new Set<string>();
  for (const d of downloadsEmCurso() as EstadoDoDownload[]) {
    ativos.add(d.videoId);
    vistos.delete(d.videoId);
    vistos.set(d.videoId, { pedidoEm: d.pedidoEm, inicioEm: d.inicioEm, bytes: d.bytes, prioridade: d.prioridade, fimEm: null });
  }
  for (const [id, v] of vistos) if (!ativos.has(id) && v.fimEm === null) v.fimEm = agora;
  while (vistos.size > 30) vistos.delete(vistos.keys().next().value as string);
}

export function ligarTempoAteAoSom(): void {
  if (ligado) return;
  ligado = true;
  ouvirDownloads(reverDownloads);
}

/** Chamado pelo leitor no primeiro som de uma faixa pedida. */
export function anotarPrimeiroSom(videoId: string, titulo: string, origem: string, totalMs: number, pedidaEm = Date.now() - totalMs): void {
  const arranque = arranqueAtual();
  const resolverMs = arranque && arranque.videoId === videoId && arranque.resolverInicioEm && arranque.resolverFimEm
    ? Math.max(0, arranque.resolverFimEm - arranque.resolverInicioEm) : null;
  const d = origem === 'cache' ? undefined : vistos.get(videoId);
  // Um download que o Smart Cache começou ANTES do pedido só conta a partir do
  // pedido: o tempo de antes não foi espera de ninguém (revisão do Codex).
  const comecou = d?.inicioEm == null ? null : Math.max(d.inicioEm, pedidaEm);
  medidas = juntarArranque(medidas, {
    titulo,
    origem,
    totalMs,
    resolverMs,
    filaMs: d && comecou !== null ? Math.max(0, comecou - Math.max(d.pedidoEm, pedidaEm)) : null,
    downloadMs: d && comecou !== null && d.fimEm !== null ? Math.max(0, d.fimEm - comecou) : null,
    mb: d ? Math.round(d.bytes / 100_000) / 10 : null,
    comecadaAntes: !!d && d.prioridade !== 'reproducao',
    em: Date.now(),
  });
}

export function arranquesMedidos(): readonly Arranque[] {
  return medidas;
}
