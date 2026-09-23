/**
 * Quando é que o iPhone pede Opus, e quando desiste dele.
 *
 * O Opus só se prova no aparelho: o AVPlayer tem de o abrir dentro de um MP4,
 * e isso não se sabe daqui (é a entrega 2 do plano, o ensaio). Por isso ele
 * liga-se, mas desliga-se sozinho como o "tocar enquanto descarrega": duas
 * faixas seguidas em que o motor recusou o ficheiro Opus -> 14 dias só AAC.
 * Mais tempo do que o stream (3 dias) porque aqui a causa provável é o iOS
 * não saber tocar o formato, e isso não muda de um dia para o outro; cada
 * tentativa custa duas faixas a recuar para o AAC.
 *
 * Uma faixa Opus que toca zera a contagem e fica a contar como PROVA: só
 * depois de haver uma é que o crossfade prepara a seguinte em Opus (ver o
 * YouTubePlayerView).
 *
 * Só conta o MOTOR: uma conversão que falhou (`OPUS_INVALIDO`) é um defeito do
 * conversor com aquele ficheiro, e a rede é da rede.
 *
 * Sem imports: `scripts/test-saude-do-opus.ts` corre isto em Node.
 */

/** O interruptor interno. `false` = a app só pede AAC, como antes da entrega 3. */
export const OPUS_LIGADO = true;

/** O Safari passou a abrir Opus em MP4 no 17; abaixo disso nem se tenta. */
export const IOS_MINIMO = 17;

export const FALHAS_PARA_DESLIGAR = 2;
export const DESLIGADO_POR_MS = 14 * 24 * 60 * 60 * 1000;

export type SaudeDoOpus = { falhasSeguidas: number; desligadoAte: number; provado: boolean };

export const SAUDE_INICIAL: SaudeDoOpus = { falhasSeguidas: 0, desligadoAte: 0, provado: false };

/** A versão maior do iOS, a partir do `Platform.Version` ("17.4" ou 17). */
export function versaoMaior(v: string | number | null | undefined): number | null {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function podePedirOpus(e: {
  ligado: boolean;
  plataforma: string;
  versaoDoIos: number | null;
  saude: SaudeDoOpus;
  agora: number;
}): boolean {
  if (!e.ligado || e.plataforma !== 'ios') return false;
  if (e.versaoDoIos === null || e.versaoDoIos < IOS_MINIMO) return false;
  // Um prazo mais longe do que o máximo só pode vir de um relógio que andou
  // para trás: não pode deixar o Opus desligado para sempre.
  const s = e.saude;
  const desligado = s.desligadoAte > e.agora && s.desligadoAte - e.agora <= DESLIGADO_POR_MS;
  return !desligado;
}

export function depoisDoMotor(s: SaudeDoOpus, resultado: 'tocou' | 'recusou', agora: number): SaudeDoOpus {
  if (resultado === 'tocou') return { falhasSeguidas: 0, desligadoAte: 0, provado: true };
  const falhas = s.falhasSeguidas + 1;
  if (falhas >= FALHAS_PARA_DESLIGAR) return { falhasSeguidas: 0, desligadoAte: agora + DESLIGADO_POR_MS, provado: s.provado };
  return { ...s, falhasSeguidas: falhas };
}

/** Aceita lixo: o que está guardado pode ser de outra versão. */
export function lerSaudeDoOpus(texto: string | null): SaudeDoOpus {
  if (!texto) return SAUDE_INICIAL;
  try {
    const v = JSON.parse(texto);
    const falhas = Number(v?.falhasSeguidas);
    const ate = Number(v?.desligadoAte);
    return {
      falhasSeguidas: Number.isInteger(falhas) && falhas > 0 ? Math.min(falhas, FALHAS_PARA_DESLIGAR) : 0,
      desligadoAte: Number.isFinite(ate) && ate > 0 ? ate : 0,
      provado: v?.provado === true,
    };
  } catch {
    return SAUDE_INICIAL;
  }
}

/** Uma linha para o relatório de reprodução. */
export function descreverSaudeDoOpus(e: {
  ligado: boolean;
  plataforma: string;
  versaoDoIos: number | null;
  saude: SaudeDoOpus;
  agora: number;
}): string {
  if (!e.ligado) return 'off (disabled in this build)';
  if (e.plataforma !== 'ios') return 'off (iPhone only)';
  if (e.versaoDoIos === null || e.versaoDoIos < IOS_MINIMO) return `off (needs iOS ${IOS_MINIMO}+)`;
  if (!podePedirOpus(e)) {
    return `off after the player refused Opus, back on ${new Date(e.saude.desligadoAte).toISOString().slice(0, 10)}`;
  }
  const prova = e.saude.provado ? 'proven on this phone' : 'not yet proven on this phone';
  const falhas = e.saude.falhasSeguidas ? `, ${e.saude.falhasSeguidas} recent refusal` : '';
  return `on (${prova}${falhas})`;
}
