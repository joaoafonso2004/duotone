/**
 * O relatório de uma faixa que ficou presa a arrancar.
 *
 * Existe para chegar à CAUSA de "a música não começa" -- que ainda acontece e
 * não se consegue ver de fora. O botão aparece por baixo da capa quando o
 * arranque fica preso (`montagemDaCapa.ts`), e o ficheiro vai pela folha de
 * partilha (`partilharRelatorioDoArranque.ts`).
 *
 * O que interessa, por ordem de suspeita:
 * - a FILA DE DOWNLOADS: só passa um de cada vez e uma vaga só se recupera ao
 *   fim de 4 minutos. Um download de fundo encravado (adiantamento, Daily mix)
 *   deixa a faixa escolhida `na-fila` sem mexer -- daí a lista de quem descarrega
 *   e há quanto tempo;
 * - o RESOLVEDOR: se começou, se acabou, com que cliente, que erro;
 * - o DOWNLOAD da faixa: bocados, último HTTP, tentativas, URL renovado;
 * - a rede, o estado do leitor e os últimos eventos do diagnóstico.
 *
 * Puro e sem imports de runtime: testado em `scripts/test-montagem-da-capa.ts`.
 */

import type { ArranqueDaFaixa } from './arranqueDaFaixa';

/** Os campos do `EstadoDoDownload` do youtubeCache de que o relatório precisa. */
export type DownloadParaRelatorio = {
  videoId: string;
  prioridade: string;
  fase: 'na-fila' | 'a-descarregar';
  pedidoEm: number;
  inicioEm: number | null;
  bytes: number;
  total: number | null;
  bocados: number;
  bocadoBytes: number;
  ultimoBocadoEm: number | null;
  tentativas: number;
  ultimoHttp: number | null;
  urlRenovado: boolean;
};

export type EntradaDoRelatorio = {
  agora: number;
  gerado: string;
  versao: string;
  build: string;
  plataforma: string;
  estado: 'nao-comecou' | 'preso-a-meio' | null;
  faixa: { titulo: string; artista: string | null; videoId: string; duracaoS: number | null } | null;
  leitor: {
    activeBackend: string;
    buffering: boolean;
    isPlaying: boolean;
    downloadProgress: number | null;
    posicaoMs: number;
    erro: string | null;
    appEstado: string;
  };
  arranque: ArranqueDaFaixa | null;
  downloads: readonly DownloadParaRelatorio[];
  fila: { aDescarregar: number; emEspera: number };
  rede: { offline: boolean; dadosMoveis: boolean };
  ultimoErroDoPoToken: string | null;
  eventos: readonly unknown[];
};

/** O prazo da vaga da fila (filaDeDownloads.ts), para quem lê saber quando se recupera. */
const PRAZO_DA_VAGA_MS = 4 * 60 * 1000;

export function montarRelatorioDoArranque(e: EntradaDoRelatorio): Record<string, unknown> {
  const ha = (t: number | null | undefined) => (t == null ? null : Math.max(0, Math.round(e.agora - t)));
  const videoId = e.faixa?.videoId ?? null;
  const daFaixa = videoId ? e.downloads.find((d) => d.videoId === videoId) ?? null : null;
  const arranque = e.arranque && e.arranque.videoId === videoId ? e.arranque : null;

  const haQuantoTempoMs = e.estado === 'preso-a-meio'
    ? ha(daFaixa?.ultimoBocadoEm ?? daFaixa?.inicioEm ?? arranque?.pedidoEm)
    : ha(arranque?.pedidoEm);

  return {
    gerado: e.gerado,
    app: `Duotone ${e.versao} (${e.build})`,
    plataforma: e.plataforma,
    estado: e.estado ?? 'a-pedido',
    haQuantoTempoMs,
    faixa: e.faixa,
    leitor: e.leitor,
    resolvedor: arranque
      ? {
          pedidoHaMs: ha(arranque.pedidoEm),
          comecou: arranque.resolverInicioEm != null,
          comecouHaMs: ha(arranque.resolverInicioEm),
          acabou: arranque.resolverFimEm != null,
          acabouHaMs: ha(arranque.resolverFimEm),
          emCurso: arranque.resolverInicioEm != null && arranque.resolverFimEm == null && arranque.erro == null,
          cliente: arranque.cliente,
          erro: arranque.erro,
        }
      : null,
    download: daFaixa
      ? {
          fase: daFaixa.fase,
          prioridade: daFaixa.prioridade,
          pedidoHaMs: ha(daFaixa.pedidoEm),
          comecouHaMs: ha(daFaixa.inicioEm),
          bytes: daFaixa.bytes,
          total: daFaixa.total,
          bocados: daFaixa.bocados,
          bocadoBytes: daFaixa.bocadoBytes,
          ultimoBocadoHaMs: ha(daFaixa.ultimoBocadoEm),
          tentativasNoBocado: daFaixa.tentativas,
          ultimoHttp: daFaixa.ultimoHttp,
          urlRenovado: daFaixa.urlRenovado,
        }
      : { emCurso: false },
    filaDeDownloads: {
      vagasOcupadas: e.fila.aDescarregar,
      emEspera: e.fila.emEspera,
      prazoDaVagaMs: PRAZO_DA_VAGA_MS,
      downloads: e.downloads.map((d) => ({
        videoId: d.videoId,
        daFaixaAtual: d.videoId === videoId,
        prioridade: d.prioridade,
        fase: d.fase,
        pedidoHaMs: ha(d.pedidoEm),
        comecouHaMs: ha(d.inicioEm),
        bocados: d.bocados,
        ultimoBocadoHaMs: ha(d.ultimoBocadoEm),
      })),
    },
    rede: e.rede,
    poToken: { ultimoErro: e.ultimoErroDoPoToken },
    eventos: e.eventos,
  };
}
