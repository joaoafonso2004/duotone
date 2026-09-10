/**
 * Saber que a extração está bloqueada ANTES de o ecrã bloquear.
 *
 * Quando o YouTube fecha a porta ao cliente que a app usa (a 2/8/2026 foi o
 * ANDROID_VR; hoje a cascata começa no VISIONOS), cada faixa cai no embed
 * oficial -- e o embed PARA quando o ecrã bloqueia. A barra do leitor já
 * mostra uma frase por faixa, mas uma frase que passa não diz que o problema
 * é sistemático, nem o que vai acontecer a seguir. Descobria-se com o
 * telemóvel no bolso e a música parada.
 *
 * Aqui conta-se o que aconteceu a cada faixa que passou pelo resolver:
 *
 *  - **Tocou no motor nativo** -> a extração está a passar. Zera tudo, e o
 *    aviso volta a poder aparecer num próximo episódio.
 *  - **Falhou por TRANSPORTE** (403/bot, CDN, sem formato) -> conta. É o que a
 *    Google faz quando fecha um cliente, e é o que manda a faixa para o embed.
 *  - **Falhou pelo VÍDEO, ou sem rede** -> não conta nem zera. Um upload
 *    removido não diz nada sobre a extração, e sem rede nada toca.
 *
 * **Três faixas DIFERENTES seguidas.** Uma é um vídeo sem formatos; duas podem
 * ser azar; três seguidas, de vídeos diferentes, é a porta fechada. A mesma
 * faixa a falhar outra vez (repetir, voltar atrás) conta uma vez só.
 *
 * `tempo-esgotado` e `desconhecido` ficam de fora de propósito: também caem no
 * embed, mas acontecem numa rede lenta, e o aviso diz que é o YouTube a
 * bloquear -- tem de ser verdade quando aparece.
 *
 * As faixas que já estão guardadas no telemóvel também não entram: tocam do
 * ficheiro e não provam nada sobre a extração. Sem isto, uma playlist meio
 * descarregada zerava a contagem a cada faixa guardada e o aviso nunca vinha.
 *
 * Sem imports de runtime: `scripts/test-saude-da-reproducao.ts` corre em Node
 * puro.
 */

import type { TipoFalha } from './playbackDiagnostics';

/** Quantas faixas diferentes seguidas, todas bloqueadas, antes de avisar. */
export const LIMIAR = 3;

/** As falhas que querem dizer "a extração não está a passar". */
const DE_TRANSPORTE: ReadonlySet<TipoFalha> = new Set<TipoFalha>([
  'bloqueio-bot',
  'cdn-recusou',
  'sem-formato',
]);

export type Estado = {
  /** As faixas bloqueadas desde a última que tocou no motor nativo. */
  seguidas: readonly string[];
  /** Já se avisou neste episódio. Só uma faixa nativa o volta a armar. */
  avisado: boolean;
};

export const INICIAL: Estado = { seguidas: [], avisado: false };

export type Observacao =
  /** Uma faixa resolvida pela extração começou a tocar no motor nativo. */
  | { tipo: 'nativo' }
  | { tipo: 'falha'; falha: TipoFalha; videoId: string };

export function observar(estado: Estado, o: Observacao): Estado {
  if (o.tipo === 'nativo') {
    return estado.seguidas.length || estado.avisado ? INICIAL : estado;
  }
  if (!DE_TRANSPORTE.has(o.falha)) return estado;
  if (estado.seguidas.includes(o.videoId)) return estado;
  return { ...estado, seguidas: [...estado.seguidas, o.videoId].slice(-LIMIAR) };
}

/** Chegou a altura de avisar? Uma vez por episódio. */
export function deveAvisar(estado: Estado): boolean {
  return !estado.avisado && estado.seguidas.length >= LIMIAR;
}

export function marcarAvisado(estado: Estado): Estado {
  return estado.avisado ? estado : { ...estado, avisado: true };
}
