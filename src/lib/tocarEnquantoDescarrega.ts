/**
 * Quando é que o iPhone toca enquanto descarrega, e quando desiste disso.
 *
 * O caminho novo (`transmitirAudio` + `modules/duotone-stream`) só se prova no
 * aparelho, e o Swift nem se compila no Windows. Por isso desliga-se sozinho:
 * se o motor não aguentar o stream em duas faixas seguidas (erro do AVPlayer,
 * ou o watchdog a ter de trocar para o ficheiro), volta-se ao caminho antigo
 * -- descarregar tudo e só depois tocar -- durante três dias. Uma faixa que
 * toca pelo stream zera a contagem.
 *
 * Falhas da REDE não contam: essas partiam o caminho antigo na mesma.
 *
 * Sem imports: `scripts/test-tocar-enquanto-descarrega.ts` corre isto em Node.
 */

export type SaudeDoStream = { falhasSeguidas: number; desligadoAte: number };

export const SAUDE_INICIAL: SaudeDoStream = { falhasSeguidas: 0, desligadoAte: 0 };

/** Faixas seguidas em que o motor não aguentou o stream. */
export const FALHAS_PARA_DESLIGAR = 2;

/** Quanto tempo fica desligado. Sai uma build nova entretanto, ou tenta outra vez. */
export const DESLIGADO_POR_MS = 3 * 24 * 60 * 60 * 1000;

export function podeTransmitir(s: SaudeDoStream, agora: number): boolean {
  // Um prazo mais longe do que o máximo só pode vir de um relógio que andou
  // para trás: não pode deixar o stream desligado para sempre.
  const desligado = s.desligadoAte > agora && s.desligadoAte - agora <= DESLIGADO_POR_MS;
  return !desligado;
}

export function depoisDeTransmitir(
  s: SaudeDoStream,
  resultado: 'tocou' | 'falhou',
  agora: number,
): SaudeDoStream {
  if (resultado === 'tocou') return SAUDE_INICIAL;
  const falhas = s.falhasSeguidas + 1;
  if (falhas >= FALHAS_PARA_DESLIGAR) return { falhasSeguidas: 0, desligadoAte: agora + DESLIGADO_POR_MS };
  return { falhasSeguidas: falhas, desligadoAte: s.desligadoAte };
}

/** Aceita lixo: o que está guardado pode ser de outra versão. */
export function lerSaude(texto: string | null): SaudeDoStream {
  if (!texto) return SAUDE_INICIAL;
  try {
    const v = JSON.parse(texto);
    const falhas = Number(v?.falhasSeguidas);
    const ate = Number(v?.desligadoAte);
    return {
      falhasSeguidas: Number.isInteger(falhas) && falhas > 0 ? Math.min(falhas, FALHAS_PARA_DESLIGAR) : 0,
      desligadoAte: Number.isFinite(ate) && ate > 0 ? ate : 0,
    };
  } catch {
    return SAUDE_INICIAL;
  }
}

/** Uma linha para o relatório de reprodução. */
export function descreverSaude(s: SaudeDoStream, agora: number, temModulo: boolean): string {
  if (!temModulo) return 'off (this build has no streaming module)';
  if (!podeTransmitir(s, agora)) {
    return `off after repeated player failures, back on ${new Date(s.desligadoAte).toISOString().slice(0, 16)}Z`;
  }
  return s.falhasSeguidas ? `on (${s.falhasSeguidas} recent player failure)` : 'on';
}

/**
 * De onde veio o primeiro som de uma faixa:
 * - `cache`: já estava no telemóvel;
 * - `stream`: tocou enquanto descarregava;
 * - `ficheiro`: descarregou tudo e só depois tocou;
 * - `hls`: o YouTube só deu um manifesto;
 * - `embed`: o player oficial do YouTube (o do PC).
 */
export type OrigemDoSom = 'cache' | 'stream' | 'ficheiro' | 'hls' | 'embed';

/** Acima disto não é uma espera, é outra coisa (a app suspensa, por exemplo). */
export const PRIMEIRA_NOTA_MAX_MS = 120_000;

/** O evento `primeira_nota`, ou nada se a medida não fizer sentido. */
export function primeiraNota(
  pedidaEm: number,
  agora: number,
  origem: OrigemDoSom,
): { origem: OrigemDoSom; ms: number } | null {
  const ms = Math.round(agora - pedidaEm);
  if (!Number.isFinite(ms) || ms < 0 || ms > PRIMEIRA_NOTA_MAX_MS) return null;
  return { origem, ms };
}
