/**
 * O AutoMix (25/10, pedido do João): a passagem de uma música para a outra na
 * batida, como um DJ. Só no iPhone, onde o ficheiro está em disco.
 *
 * O ritmo de cada faixa sai do `ritmo.ts` (o fim da que sai, o início da que
 * entra). Aqui decide-se a passagem:
 *
 * - **Na batida**, quando os andamentos batem (ou um é o dobro do outro): a
 *   que entra começa no primeiro tempo forte dela, em cima de um tempo forte
 *   da que sai, e as duas cruzam-se durante 2 a 8 compassos. Sem esticar o
 *   tempo -- mexer na velocidade muda o tom (`.varispeed`) e arranca o leitor
 *   (CLAUDE.md) --, por isso a passagem só dura o que a diferença de
 *   andamento deixa sem as batidas se desencontrarem.
 * - **Suave**, quando não batem ou não há batida clara: um fade com a duração
 *   do crossfade, a começar num tempo forte da que sai, e a que entra a partir
 *   do primeiro som (sem o silêncio do início).
 * - **Nenhuma** (`null`) sem análise: fica o crossfade de sempre.
 *
 * Funções puras -- ver scripts/test-automix.ts.
 */
import { CONFIANCA_MINIMA, type Ritmo } from './ritmo';

export type PlanoDoAutomix = {
  tipo: 'batida' | 'suave';
  /** Onde a passagem começa, em segundos na faixa que SAI. */
  inicioS: number;
  /** De onde a que entra começa a tocar, em segundos nela. */
  entraEmS: number;
  duracaoS: number;
  /** Para o relatório: os andamentos e a confiança mais baixa das duas. */
  bpmSai: number | null;
  bpmEntra: number | null;
  confianca: number;
  confiancaSai: number;
  confiancaEntra: number;
  motivo: string;
};

/** Quanto as batidas se podem desencontrar até ao fim da passagem, em batidas. */
const DESENCONTRO_MAXIMO = 0.15;
/** Uma passagem na batida dura entre isto, em segundos. */
const BATIDA_MINIMA_S = 3;
const BATIDA_MAXIMA_S = 16;
/** Sem crossfade nas Definições, a passagem suave dura isto. */
export const SUAVE_POR_OMISSAO_S = 6;

/**
 * Quanto dura a passagem quando há AutoMix: a do crossfade, ou 6 s com ele
 * desligado (o AutoMix ligado já é um pedido de passagem). Sem AutoMix, a do
 * crossfade, como sempre.
 */
export function duracaoDaPassagem(s: { automix: boolean; crossfadeSegundos: number }): number {
  if (!s.automix) return s.crossfadeSegundos;
  return s.crossfadeSegundos > 0 ? s.crossfadeSegundos : SUAVE_POR_OMISSAO_S;
}

/** A razão entre os andamentos levada para perto de 1 (o dobro e a metade contam). */
export function razaoDosAndamentos(bpmSai: number, bpmEntra: number): number {
  const r = bpmSai / bpmEntra;
  return [r, r * 2, r / 2].reduce((melhor, x) => (Math.abs(x - 1) < Math.abs(melhor - 1) ? x : melhor));
}

/** As guardas antes de analisar, explicadas no relatorio sem fazer pedidos. */
export function impedimentoDoAutomix(c: {
  duracaoS: number | null; rateSai: number; rateEntra: number;
  localSai: boolean; localEntra: boolean; hls: boolean;
}): string | null {
  const motivos: string[] = [];
  if (!(c.duracaoS != null && Number.isFinite(c.duracaoS) && c.duracaoS > 0)) motivos.push('duration missing');
  if (Math.abs(c.rateSai - 1) >= 0.001 || Math.abs(c.rateEntra - 1) >= 0.001
    || !Number.isFinite(c.rateSai) || !Number.isFinite(c.rateEntra)) {
    motivos.push(`speed is not 1x (${c.rateSai} -> ${c.rateEntra})`);
  }
  if (!c.localSai) motivos.push(c.hls ? 'current audio is HLS, no local file' : 'current local audio missing');
  if (!c.localEntra) motivos.push('next local audio missing');
  return motivos.length ? motivos.join('; ') : null;
}

export function planoDoAutomix(c: {
  /** O ritmo do FIM da que sai, e do INÍCIO da que entra. */
  sai: Ritmo | null;
  entra: Ritmo | null;
  /** Onde a música da que sai acaba (análise da cauda), se se souber. */
  fimMusicalS: number | null;
  duracaoSaiS: number;
  /** A duração da passagem suave (`duracaoDaPassagem`). */
  suaveS: number;
}): PlanoDoAutomix | null {
  const { sai, entra } = c;
  if (!sai || !entra || !(c.duracaoSaiS > 0)) return null;
  const fim = Math.min(c.duracaoSaiS, c.fimMusicalS && c.fimMusicalS > 0 ? Math.min(c.fimMusicalS, sai.somS) : sai.somS);
  // Uma passagem que comece antes de meio da música já não é passagem.
  const cedoDemais = c.duracaoSaiS * 0.5;
  const confianca = Math.min(sai.confianca, entra.confianca);
  const base = { bpmSai: sai.bpm, bpmEntra: entra.bpm, confianca, confiancaSai: sai.confianca, confiancaEntra: entra.confianca };
  let motivo = confianca < CONFIANCA_MINIMA ? `low confidence (<${CONFIANCA_MINIMA})`
    : 'no downbeat near the start';

  // O primeiro tempo forte da que entra, se vier logo com o som (no máximo um
  // compasso depois): é aí que ela entra numa passagem na batida.
  const compassoEntra = entra.periodoS * 4;
  const forteEntra = entra.temposFortesS.find((x) => x >= entra.somS - 0.05);
  const entraNaBatida = forteEntra != null && forteEntra - entra.somS <= compassoEntra + 0.05;

  if (confianca >= CONFIANCA_MINIMA && entraNaBatida) {
    const r = razaoDosAndamentos(sai.bpm, entra.bpm);
    const desvio = Math.abs(r - 1);
    motivo = desvio > 0.04 ? 'different tempos' : 'no aligned bars fit before the end';
    if (desvio <= 0.04) {
      // Quantas batidas cabem até o desencontro chegar ao máximo.
      const batidas = desvio > 0 ? DESENCONTRO_MAXIMO / desvio : Infinity;
      for (const compassos of [8, 4, 2]) {
        const duracaoS = compassos * 4 * sai.periodoS;
        if (compassos * 4 > batidas || duracaoS < BATIDA_MINIMA_S || duracaoS > BATIDA_MAXIMA_S) continue;
        // O último tempo forte da que sai em que a passagem ainda cabe antes
        // do fim da música.
        const inicio = [...sai.temposFortesS].reverse().find((x) => x + duracaoS <= fim - 0.1 && x >= cedoDemais);
        if (inicio != null) {
          return { tipo: 'batida', inicioS: inicio, entraEmS: forteEntra!, duracaoS, motivo: 'matching beats', ...base };
        }
      }
    }
  }

  // Suave: com a duração do crossfade, a acabar no fim da música, e a
  // começar num tempo forte da que sai quando há batida para isso.
  const duracaoS = c.suaveS;
  if (!(duracaoS > 0) || fim - duracaoS < cedoDemais) return null;
  let inicioS = fim - duracaoS;
  if (sai.confianca >= CONFIANCA_MINIMA) {
    const forte = [...sai.temposFortesS].reverse().find((x) => x <= inicioS && x >= inicioS - sai.periodoS * 4);
    if (forte != null) inicioS = forte;
  }
  return { tipo: 'suave', inicioS, entraEmS: Math.max(0, entra.somS), duracaoS, motivo, ...base };
}

/**
 * Pode o AutoMix agendar já? Com alguma antecedência (o lado nativo precisa
 * de pôr a que entra no sítio antes de a soltar), e nunca em cima da hora.
 */
export const ANTECEDENCIA_DO_AGENDAMENTO_S = 3;
export function deveAgendar(plano: PlanoDoAutomix, posicaoS: number): boolean {
  const falta = plano.inicioS - posicaoS;
  return falta <= ANTECEDENCIA_DO_AGENDAMENTO_S && falta > 0.4;
}

/** A frase do relatório de reprodução para uma passagem do AutoMix. */
export function descreverPlano(p: PlanoDoAutomix): string {
  const bpm = (x: number | null) => (x == null ? '?' : x.toFixed(1));
  return `automix ${p.tipo}: from ${p.inicioS.toFixed(2)}s, next from ${p.entraEmS.toFixed(2)}s, `
    + `${p.duracaoS.toFixed(1)}s, ${bpm(p.bpmSai)} -> ${bpm(p.bpmEntra)} bpm, `
    + `confidence ${p.confiancaSai.toFixed(1)} -> ${p.confiancaEntra.toFixed(1)} (min ${CONFIANCA_MINIMA}), ${p.motivo}`;
}
