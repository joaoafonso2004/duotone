/**
 * O AutoMix (25/10, pedido do João): a passagem de uma música para a outra
 * como um DJ. Só no iPhone, onde o ficheiro está em disco.
 *
 * O ritmo de cada faixa sai do `ritmo.ts` (o fim da que sai, o início da que
 * entra). Aqui decide-se a passagem, e desde 26/10 ("mesmo que as músicas
 * sejam diferentes, arranja maneira de fazer a transição", nível DJ) também
 * entre andamentos que não batem. O que se tirou dos sistemas de DJ abertos
 * (o AutoDJ do Mixxx, o DJ automático de Vande Veire, o AutoMix do SimpMusic):
 * nunca duas linhas de baixo ao mesmo tempo -- os graves trocam-se num
 * compasso, pelo equalizador de cada faixa --, a troca no fim de uma frase, e
 * os agudos da que entra antes dos graves dela. Sem esticar o tempo: mexer na
 * velocidade muda o tom (`.varispeed`) e arranca o leitor (CLAUDE.md).
 *
 * - **Na batida**, quando os andamentos batem (ou um é o dobro do outro): a
 *   que entra começa no primeiro tempo forte dela, em cima de um tempo forte
 *   da que sai, e as duas cruzam-se 2 a 8 compassos, a acabar onde a batida
 *   da que sai acaba. A meio, os graves trocam num compasso.
 * - **Por cima**, quando não batem e a que entra tem uma intro sem batida: a
 *   intro entra por baixo do fim da que sai, e a batida dela cai no tempo
 *   forte em que a da outra acaba.
 * - **Na cauda**, quando a que sai acaba com uma cauda sem batida: a batida da
 *   que entra começa onde a da outra acaba, e a cauda desvanece por baixo,
 *   sem graves e a perder os agudos.
 * - **Corte**, quando as duas têm batida até ao fim: um corte no "um", como um
 *   DJ entre dois andamentos -- a que sai perde os graves nos dois últimos
 *   compassos e sai numa batida; a que entra começa cheia no tempo forte dela.
 * - **Suave**, sem batida clara: um fade com a duração do crossfade, a
 *   começar num tempo forte quando há, com os graves trocados a meio.
 * - **Nenhuma** (`null`) sem análise: fica o crossfade de sempre.
 *
 * Cada plano traz a CURVA: o volume e o corte de graves e agudos de cada uma,
 * em pontos, do instante marcado (`inicioS`) em diante -- a que sai pode
 * começar um pouco antes (tempos negativos), a que entra nunca.
 *
 * Funções puras -- ver scripts/test-automix.ts.
 */
import { CONFIANCA_MINIMA, type Ritmo } from './ritmo';

export type TipoDePassagem = 'batida' | 'por-cima' | 'cauda' | 'corte' | 'suave';

/** Pontos [segundos, valor], ligados por retas. */
export type Pontos = readonly (readonly [number, number])[];

export type CurvaDaPassagem = {
  /** O volume de cada uma, de 0 a 1 do teto dela. */
  volSai: Pontos;
  volEntra: Pontos;
  /** O corte dos graves e dos agudos de cada uma, em dB (0 ou negativo). */
  gravesSai: Pontos;
  gravesEntra: Pontos;
  agudosSai: Pontos;
  agudosEntra: Pontos;
};

export type PlanoDoAutomix = {
  tipo: TipoDePassagem;
  /** Onde a passagem começa, em segundos na faixa que SAI. */
  inicioS: number;
  /** De onde a que entra começa a tocar, em segundos nela. */
  entraEmS: number;
  duracaoS: number;
  curva: CurvaDaPassagem;
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
/** Uma intro ou uma cauda sem batida conta a partir disto. */
const SEM_BATIDA_MINIMO_S = 3;
/** Quanto da intro da que entra soa por baixo da que sai, no máximo. */
const POR_CIMA_MAXIMO_S = 16;
/** Quanto da cauda da que sai fica a desvanecer por baixo, no máximo. */
const CAUDA_MAXIMA_S = 8;
/**
 * O corte dos graves e dos agudos, em dB: o limite do equalizador
 * (`GANHO_MAXIMO` do lib/equalizer.ts). Na prateleira dos 105 Hz, -20 dB é o
 * "kill" de um misturador de DJ para quem ouve.
 */
export const CORTE_DB = -20;

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
  /**
   * O binário põe a que entra à velocidade dela (`agendarEntradaComTaxa`,
   * 26/10). Com ele o AutoMix mistura a qualquer velocidade; sem ele, a 1x.
   */
  comVelocidade?: boolean;
}): string | null {
  const motivos: string[] = [];
  if (!(c.duracaoS != null && Number.isFinite(c.duracaoS) && c.duracaoS > 0)) motivos.push('duration missing');
  const valida = (r: number) => Number.isFinite(r) && r >= 0.5 && r <= 2;
  if (!valida(c.rateSai) || !valida(c.rateEntra)) {
    motivos.push(`speed out of range (${c.rateSai} -> ${c.rateEntra})`);
  } else if (!c.comVelocidade && (Math.abs(c.rateSai - 1) >= 0.001 || Math.abs(c.rateEntra - 1) >= 0.001)) {
    motivos.push(`speed is not 1x (${c.rateSai} -> ${c.rateEntra}; this build mixes only at 1x)`);
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
  /**
   * A velocidade de cada uma (26/10). As batidas que se ouvem são as do
   * ritmo vezes a velocidade; os tempos do plano ficam no tempo de cada
   * faixa (o da que sai para a curva e o instante, o da que entra para o
   * `entraEmS`).
   */
  taxaSai?: number;
  taxaEntra?: number;
}): PlanoDoAutomix | null {
  const { sai, entra } = c;
  if (!sai || !entra || !(c.duracaoSaiS > 0)) return null;
  const taxaSai = c.taxaSai && c.taxaSai > 0 ? c.taxaSai : 1;
  const taxaEntra = c.taxaEntra && c.taxaEntra > 0 ? c.taxaEntra : 1;
  // Segundos da que entra em segundos da que sai: o mesmo tempo de relógio.
  const daEntraParaASai = taxaSai / taxaEntra;
  const fim = Math.min(c.duracaoSaiS, c.fimMusicalS && c.fimMusicalS > 0 ? Math.min(c.fimMusicalS, sai.somS) : sai.somS);
  // Uma passagem que comece antes de meio da música já não é passagem.
  const cedoDemais = c.duracaoSaiS * 0.5;
  const confianca = Math.min(sai.confianca, entra.confianca);
  const base = {
    bpmSai: sai.bpm * taxaSai, bpmEntra: entra.bpm * taxaEntra, confianca,
    confiancaSai: sai.confianca, confiancaEntra: entra.confianca,
  };
  const seguro = confianca >= CONFIANCA_MINIMA;
  let motivo = !seguro ? `low confidence (<${CONFIANCA_MINIMA})` : 'no downbeat near the start';
  const compassoSai = sai.periodoS * 4;

  // O primeiro tempo forte da que entra, se vier logo com o som (no máximo um
  // compasso depois): é aí que ela entra numa passagem na batida.
  const compassoEntra = entra.periodoS * 4;
  const forteEntra = entra.temposFortesS.find((x) => x >= entra.somS - 0.05);
  const entraNaBatida = forteEntra != null && forteEntra - entra.somS <= compassoEntra + 0.05;
  // Onde a batida da que sai acaba: o fim da última frase com batida. As
  // passagens acabam (ou trocam) aí, e não a meio de um compasso.
  const fimDaBatida = Math.min(fim, sai.batidaS ?? fim);
  // Onde a batida da que entra começa.
  const batidaEntra = Math.max(entra.somS, entra.batidaS ?? forteEntra ?? entra.somS);

  if (seguro && entraNaBatida) {
    const r = razaoDosAndamentos(sai.bpm * taxaSai, entra.bpm * taxaEntra);
    const desvio = Math.abs(r - 1);
    motivo = desvio > 0.04 ? 'different tempos' : 'no aligned bars fit before the end';
    if (desvio <= 0.04) {
      // Quantas batidas cabem até o desencontro chegar ao máximo.
      const batidas = desvio > 0 ? DESENCONTRO_MAXIMO / desvio : Infinity;
      for (const compassos of [8, 4, 2]) {
        const duracaoS = compassos * compassoSai;
        if (compassos * 4 > batidas || duracaoS < BATIDA_MINIMA_S || duracaoS > BATIDA_MAXIMA_S) continue;
        // O último tempo forte da que sai em que a passagem ainda cabe antes
        // do fim da música e da batida dela.
        const limite = Math.min(fim - 0.1, fimDaBatida + 0.05);
        const inicio = [...sai.temposFortesS].reverse().find((x) => x + duracaoS <= limite && x >= cedoDemais);
        if (inicio != null) {
          return {
            tipo: 'batida', inicioS: inicio, entraEmS: forteEntra!, duracaoS,
            curva: curvaNaBatida(duracaoS, compassoSai), motivo: 'matching beats', ...base,
          };
        }
      }
    }
  }

  if (seguro) {
    // A troca: o tempo forte em que a batida da que sai acaba.
    const troca = sai.batidaS != null
      ? fimDaBatida
      : [...sai.temposFortesS].reverse().find((x) => x <= fim - 0.1) ?? fim;
    const intro = batidaEntra - entra.somS;
    const cauda = fim - troca;
    const porque = motivo === 'no aligned bars fit before the end' ? motivo : 'different tempos';

    // Por cima: a intro sem batida da que entra por baixo do fim da que sai.
    // `a` é a intro no tempo da que entra; `aSai`, o mesmo no da que sai.
    if (intro >= SEM_BATIDA_MINIMO_S) {
      const a = Math.min(intro, POR_CIMA_MAXIMO_S, (troca - cedoDemais) / daEntraParaASai);
      if (a >= SEM_BATIDA_MINIMO_S) {
        const aSai = a * daEntraParaASai;
        const saida = Math.min(4, Math.max(sai.periodoS, cauda));
        return {
          tipo: 'por-cima', inicioS: troca - aSai, entraEmS: batidaEntra - a, duracaoS: aSai + saida,
          curva: curvaPorCima(aSai, saida, sai.periodoS), motivo: `${porque}: next intro has no beat`, ...base,
        };
      }
    }
    // Na cauda: a batida da que entra começa onde a da outra acaba.
    if (cauda >= SEM_BATIDA_MINIMO_S && troca >= cedoDemais) {
      const f = Math.min(cauda, CAUDA_MAXIMA_S);
      return {
        tipo: 'cauda', inicioS: troca, entraEmS: batidaEntra, duracaoS: f,
        curva: curvaNaCauda(f, compassoEntra * daEntraParaASai), motivo: `${porque}: current outro has no beat`, ...base,
      };
    }
    // Corte no "um": a que sai perde os graves nos dois últimos compassos.
    const preparacao = Math.min(2 * compassoSai, 2);
    if (troca - preparacao >= cedoDemais) {
      const saida = Math.min(0.6, Math.max(0.3, sai.periodoS));
      return {
        tipo: 'corte', inicioS: troca, entraEmS: batidaEntra, duracaoS: saida,
        curva: curvaDeCorte(saida, preparacao), motivo: `${porque}: cut on the downbeat`, ...base,
      };
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
  return { tipo: 'suave', inicioS, entraEmS: Math.max(0, entra.somS), duracaoS, curva: curvaSuave(duracaoS), motivo, ...base };
}

// ------------------------------------------------------------ as curvas ----

const arredondar = (x: number) => Math.round(x * 1e6) / 1e6;

/** Igual potência (seno e cosseno), em nove pontos: a soma das potências não afunda a meio. */
function igualPotencia(d: number): { volSai: Pontos; volEntra: Pontos } {
  const xs = Array.from({ length: 9 }, (_, i) => i / 8);
  return {
    volSai: xs.map((x) => [x * d, arredondar(Math.cos((x * Math.PI) / 2))] as const),
    volEntra: xs.map((x) => [x * d, arredondar(Math.sin((x * Math.PI) / 2))] as const),
  };
}

/**
 * Na batida (o "rolling" de Vande Veire): a que entra sobe sem graves e com
 * os agudos baixos até meio; no compasso do meio os graves trocam -- os da que
 * sai vão-se, os da que entra chegam --, e daí em diante a que sai desce, a
 * perder os agudos.
 */
function curvaNaBatida(d: number, compasso: number): CurvaDaPassagem {
  const meio = d / 2;
  const troca = Math.min(compasso, d / 8);
  const resto = meio + (d - meio) / 2;
  return {
    volEntra: [[0, 0], [troca, 0.45], [meio / 2, 0.85], [meio, 0.85], [meio + troca, 1]],
    gravesEntra: [[0, CORTE_DB], [meio, CORTE_DB], [meio + troca, 0]],
    agudosEntra: [[0, -10], [meio / 2, -10], [meio, -4], [meio + troca, 0]],
    volSai: [[0, 1], [meio, 1], [meio + troca, 0.9], [resto, 0.9], [d, 0]],
    gravesSai: [[0, 0], [meio, 0], [meio + troca, CORTE_DB]],
    agudosSai: [[0, 0], [meio, 0], [meio + troca, -6], [resto, -14], [d, CORTE_DB]],
  };
}

/**
 * Por cima: a intro da que entra sobe por baixo (sem graves) durante `a`
 * segundos; a que sai perde os graves no último quarto, e no instante em que
 * a batida da que entra cai (`a`) sai em `saida` segundos.
 */
function curvaPorCima(a: number, saida: number, batida: number): CurvaDaPassagem {
  const d = a + saida;
  return {
    volEntra: [[0, 0], [a * 0.3, 0.4], [a * 0.75, 0.7], [a, 0.8], [a + Math.min(batida, saida), 1]],
    gravesEntra: [[0, CORTE_DB], [a, CORTE_DB], [a + Math.min(batida, saida), 0]],
    agudosEntra: [[0, 0]],
    volSai: [[0, 1], [a * 0.75, 1], [a, 0.85], [d, 0]],
    gravesSai: [[0, 0], [a * 0.75, 0], [a, CORTE_DB]],
    agudosSai: [[0, 0], [a, 0], [d, -12]],
  };
}

/**
 * Na cauda: a que entra começa quase cheia, no tempo forte dela; a cauda da
 * que sai perde os graves logo (um baixo a soar por baixo de um bombo novo é
 * o que se ouve como confusão) e os agudos ao desvanecer.
 */
function curvaNaCauda(f: number, compassoEntra: number): CurvaDaPassagem {
  return {
    volEntra: [[0, 0.9], [Math.min(f, compassoEntra), 1]],
    gravesEntra: [[0, 0]],
    agudosEntra: [[0, 0]],
    volSai: [[0, 1], [f * 0.5, 0.6], [f, 0]],
    gravesSai: [[0, -8], [Math.min(1, f), CORTE_DB]],
    agudosSai: [[0, 0], [f, -14]],
  };
}

/**
 * Corte no "um": nos `preparacao` segundos antes, a que sai perde os graves
 * (fica mais fina, como um filtro a fechar); no tempo forte sai em `saida`
 * segundos, e a que entra começa cheia.
 */
function curvaDeCorte(saida: number, preparacao: number): CurvaDaPassagem {
  return {
    volEntra: [[0, 0.92], [saida, 1]],
    gravesEntra: [[0, 0]],
    agudosEntra: [[0, 0]],
    volSai: [[-preparacao, 1], [0, 1], [saida, 0]],
    gravesSai: [[-preparacao, 0], [0, -14], [saida, CORTE_DB]],
    agudosSai: [[-preparacao, 0], [0, -3], [saida, -6]],
  };
}

/** Suave: igual potência, com os graves trocados a meio, num instante curto. */
function curvaSuave(d: number): CurvaDaPassagem {
  return {
    ...igualPotencia(d),
    gravesEntra: [[0, CORTE_DB], [d * 0.45, CORTE_DB], [d * 0.6, 0]],
    agudosEntra: [[0, 0]],
    gravesSai: [[0, 0], [d * 0.45, 0], [d * 0.6, CORTE_DB]],
    agudosSai: [[0, 0]],
  };
}

/** O valor de uma curva num instante: reta entre os pontos, e os extremos fora deles. */
export function noInstante(p: Pontos, t: number): number {
  if (!p.length) return 0;
  if (t <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    const [t1, v1] = p[i];
    if (t <= t1) {
      const [t0, v0] = p[i - 1];
      return t1 > t0 ? v0 + ((v1 - v0) * (t - t0)) / (t1 - t0) : v1;
    }
  }
  return p[p.length - 1][1];
}

export type EstadoDaPassagem = {
  volSai: number; volEntra: number;
  gravesSai: number; gravesEntra: number;
  agudosSai: number; agudosEntra: number;
};

/** A passagem num instante, em segundos desde o instante marcado (pode ser negativo). */
export function estadoDaPassagem(c: CurvaDaPassagem, t: number): EstadoDaPassagem {
  const depois = Math.max(0, t);
  return {
    volSai: noInstante(c.volSai, t), volEntra: noInstante(c.volEntra, depois),
    gravesSai: noInstante(c.gravesSai, t), gravesEntra: noInstante(c.gravesEntra, depois),
    agudosSai: noInstante(c.agudosSai, t), agudosEntra: noInstante(c.agudosEntra, depois),
  };
}

/** Quantos segundos antes do instante marcado a que sai já começa a mudar. */
export function preparacaoDaCurva(c: CurvaDaPassagem): number {
  return Math.max(0, -Math.min(c.volSai[0]?.[0] ?? 0, c.gravesSai[0]?.[0] ?? 0, c.agudosSai[0]?.[0] ?? 0));
}

/**
 * Os dez ganhos do equalizador (lib/equalizer.ts: a prateleira dos 105 Hz, os
 * 64 e os 125; ... ; os 8 kHz e a prateleira dos 10 kHz) com o corte da
 * passagem por cima do perfil da faixa. Os graves vão sobretudo à prateleira;
 * os agudos, à dos 10 kHz.
 */
export function ganhosComPassagem(ganhos: readonly number[], gravesDb: number, agudosDb: number): number[] {
  const g = ganhos.slice(0, 10);
  while (g.length < 10) g.push(0);
  g[0] += gravesDb;
  g[1] += gravesDb * 0.5;
  g[2] += gravesDb * 0.35;
  g[8] += agudosDb * 0.5;
  g[9] += agudosDb;
  return g.map((v) => Math.round(Math.max(CORTE_DB, Math.min(-CORTE_DB, v)) * 10) / 10);
}

/**
 * Pode o AutoMix agendar já? Com alguma antecedência (o lado nativo precisa
 * de pôr a que entra no sítio antes de a soltar), e nunca em cima da hora.
 */
export const ANTECEDENCIA_DO_AGENDAMENTO_S = 3;
export function deveAgendar(plano: PlanoDoAutomix, posicaoS: number): boolean {
  // O corte prepara a que sai antes do instante: agenda-se antes disso.
  const falta = plano.inicioS - preparacaoDaCurva(plano.curva) - posicaoS;
  return falta <= ANTECEDENCIA_DO_AGENDAMENTO_S && falta > 0.4;
}

/** A frase do relatório de reprodução para uma passagem do AutoMix. */
export function descreverPlano(p: PlanoDoAutomix): string {
  const bpm = (x: number | null) => (x == null ? '?' : x.toFixed(1));
  return `automix ${p.tipo}: from ${p.inicioS.toFixed(2)}s, next from ${p.entraEmS.toFixed(2)}s, `
    + `${p.duracaoS.toFixed(1)}s, ${bpm(p.bpmSai)} -> ${bpm(p.bpmEntra)} bpm, `
    + `confidence ${p.confiancaSai.toFixed(1)} -> ${p.confiancaEntra.toFixed(1)} (min ${CONFIANCA_MINIMA}), ${p.motivo}`;
}
