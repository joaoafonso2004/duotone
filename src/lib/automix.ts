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
import { batidaSegura, CONFIANCA_COM_ESTABILIDADE, CONFIANCA_MINIMA, distanciaHarmonica, nomeDoTom, semitonsParaCasar, TOM_CONFIAVEL, type Ritmo } from './ritmo';

export type TipoDePassagem = 'batida' | 'por-cima' | 'cauda' | 'corte' | 'suave';

/** Pontos [segundos, valor], ligados por retas. */
export type Pontos = readonly (readonly [number, number])[];

export type CurvaDaPassagem = {
  /** O volume de cada uma, de 0 a 1 do teto dela. */
  volSai: Pontos;
  volEntra: Pontos;
  /**
   * O corte dos graves, dos médios e dos agudos de cada uma, em dB (0 ou
   * negativo): a troca dos graves, e o filtro de DJ -- a que sai fecha (os
   * graves e depois os médios), a que entra abre (os agudos).
   */
  gravesSai: Pontos;
  gravesEntra: Pontos;
  mediosSai: Pontos;
  mediosEntra: Pontos;
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
  /** A tonalidade de cada uma na roda Camelot ("8B"), quando se sabe (26/10). */
  tomSai: string | null;
  tomEntra: string | null;
  /**
   * Quantos semitons a que sai se dobra ao sair, como um vinil (26/10, a
   * quarta mudança): só na cauda e no suave, só com as tonalidades a chocar,
   * e só até 2. 0 é não mexer.
   */
  semitons: number;
  /**
   * A velocidade da que entra, a multiplicar pela dela, durante a passagem na
   * batida (26/10): andamentos a menos de 4 % acertam-se como num fader de
   * pitch, em vez de as batidas se desencontrarem. 1 é não mexer. No fim da
   * passagem ela volta à dela.
   */
  acertoEntra: number;
  motivo: string;
};

/** Quanto as batidas se podem desencontrar até ao fim da passagem, em batidas. */
const DESENCONTRO_MAXIMO = 0.15;
/** Uma passagem na batida dura entre isto, em segundos. */
const BATIDA_MINIMA_S = 3;
const BATIDA_MAXIMA_S = 10;
/** Sem crossfade nas Definições, a passagem suave dura isto. */
export const SUAVE_POR_OMISSAO_S = 6;
/** Uma intro ou uma cauda sem batida conta a partir disto. */
const SEM_BATIDA_MINIMO_S = 3;
/** Quanto da intro da que entra soa por baixo da que sai, no máximo. */
const POR_CIMA_MAXIMO_S = 8;
/** Quanto da cauda da que sai fica a desvanecer por baixo, no máximo. */
const CAUDA_MAXIMA_S = 4;
/**
 * A passagem suave dura no máximo isto (26/10, João: "muitas vezes parece
 * ser só um crossfade mais longo"): um DJ não cruza 6 s de duas músicas sem
 * batida; passa-as com um filtro, depressa.
 */
const SUAVE_MAXIMO_S = 3;
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
  /** O binário põe a que entra a uma velocidade dada (`agendarEntradaComTaxa`): pode acertar o andamento. */
  podeAcertar?: boolean;
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
  // A tonalidade das duas (26/10), quando o nativo a leu e é clara. Duas que
  // chocam (mais de um passo na roda Camelot) não se sobrepõem muito tempo:
  // um DJ corta, ou passa depressa.
  const tomSai = sai.tom && sai.tom.confianca >= TOM_CONFIAVEL ? sai.tom : null;
  const tomEntra = entra.tom && entra.tom.confianca >= TOM_CONFIAVEL ? entra.tom : null;
  const choque = !!tomSai && !!tomEntra && distanciaHarmonica(tomSai, tomEntra) >= 2;
  // A quarta mudança: a que sai dobra-se até 2 semitons para casar (só na
  // cauda e no suave, onde a que sai já não leva batida que se desencontre).
  const dobrar = choque ? semitonsParaCasar(tomSai!, tomEntra!, 2) ?? 0 : 0;
  const base = {
    bpmSai: sai.bpm * taxaSai, bpmEntra: entra.bpm * taxaEntra, confianca,
    confiancaSai: sai.confianca, confiancaEntra: entra.confianca,
    tomSai: tomSai ? nomeDoTom(tomSai) : null, tomEntra: tomEntra ? nomeDoTom(tomEntra) : null,
    semitons: 0,
    acertoEntra: 1,
  };
  // Segura: confiança alta, ou na zona cinzenta com o andamento estável (26/10).
  const seguro = batidaSegura(sai) && batidaSegura(entra);
  let motivo = !seguro ? `low confidence (<${CONFIANCA_MINIMA}, or <${CONFIANCA_COM_ESTABILIDADE} without a steady tempo)` : 'no downbeat near the start';
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
      // Com o binário que o sabe fazer, a que entra acerta o andamento pela
      // velocidade (r: até 4 %, como o fader de pitch de um DJ) e as batidas
      // não se desencontram (26/10, relatório da 5.4.3: 100 e 102 BPM davam
      // um corte, porque nem 2 compassos cabiam).
      const acertoEntra = c.podeAcertar && desvio > 0.002 ? r : 1;
      // Quantas batidas cabem até o desencontro chegar ao máximo.
      const batidas = desvio > 0 && acertoEntra === 1 ? DESENCONTRO_MAXIMO / desvio : Infinity;
      // Até 4 compassos (26/10): 8 soavam a um crossfade longo. Com as
      // tonalidades a chocar, só 2.
      for (const compassos of choque ? [2] : [4, 2]) {
        const duracaoS = compassos * compassoSai;
        if (compassos * 4 > batidas || duracaoS < BATIDA_MINIMA_S || duracaoS > BATIDA_MAXIMA_S) continue;
        // O último tempo forte da que sai em que a passagem ainda cabe antes
        // do fim da música e da batida dela.
        const limite = Math.min(fim - 0.1, fimDaBatida + 0.05);
        const inicio = [...sai.temposFortesS].reverse().find((x) => x + duracaoS <= limite && x >= cedoDemais);
        if (inicio != null) {
          return {
            tipo: 'batida', inicioS: inicio, entraEmS: forteEntra!, duracaoS,
            curva: curvaNaBatida(duracaoS, compassoSai), motivo: acertoEntra !== 1 ? 'matching beats (tempo nudged)' : 'matching beats', ...base,
            acertoEntra,
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
      const a = Math.min(intro, choque ? 4 : POR_CIMA_MAXIMO_S, (troca - cedoDemais) / daEntraParaASai);
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
      const f = Math.min(cauda, choque ? 2.5 : CAUDA_MAXIMA_S);
      return {
        tipo: 'cauda', inicioS: troca, entraEmS: batidaEntra, duracaoS: f,
        curva: curvaNaCauda(f, compassoEntra * daEntraParaASai), motivo: `${porque}: current outro has no beat`, ...base,
        semitons: dobrar,
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
  const duracaoS = Math.min(c.suaveS, choque ? 2 : SUAVE_MAXIMO_S);
  if (!(duracaoS > 0) || fim - duracaoS < cedoDemais) return null;
  let inicioS = fim - duracaoS;
  if (batidaSegura(sai)) {
    const forte = [...sai.temposFortesS].reverse().find((x) => x <= inicioS && x >= inicioS - sai.periodoS * 4);
    if (forte != null) inicioS = forte;
  }
  return {
    tipo: 'suave', inicioS, entraEmS: Math.max(0, entra.somS), duracaoS, curva: curvaSuave(duracaoS), motivo, ...base,
    semitons: dobrar,
  };
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
 * Na batida (o "rolling" de Vande Veire), num máximo de 4 compassos: a que
 * entra chega abafada (sem graves, os médios e os agudos baixos) e vai
 * abrindo até meio; no compasso do meio os graves trocam -- os da que sai
 * vão-se, os da que entra chegam --, e daí em diante a que sai fecha como um
 * filtro a subir (os médios e depois os agudos) enquanto desce.
 */
function curvaNaBatida(d: number, compasso: number): CurvaDaPassagem {
  const meio = d / 2;
  const troca = Math.min(compasso, d / 4);
  return {
    volEntra: [[0, 0], [Math.min(troca, d / 8), 0.6], [meio, 0.85], [meio + troca, 1]],
    gravesEntra: [[0, CORTE_DB], [meio, CORTE_DB], [meio + troca, 0]],
    mediosEntra: [[0, -6], [meio, 0]],
    agudosEntra: [[0, -14], [meio, -4], [meio + troca, 0]],
    volSai: [[0, 1], [meio, 1], [meio + troca, 0.85], [d, 0]],
    gravesSai: [[0, 0], [meio, 0], [meio + troca, CORTE_DB]],
    mediosSai: [[0, 0], [meio + troca, 0], [d, -14]],
    agudosSai: [[0, 0], [meio + troca, 0], [d, -10]],
  };
}

/**
 * Por cima: a intro da que entra sobe por baixo durante `a` segundos, sem
 * graves e a abrir os agudos; a que sai fecha nesse tempo como um filtro a
 * subir (os graves a meio, depois os médios), e no instante em que a batida
 * da que entra cai (`a`) sai em `saida` segundos.
 */
function curvaPorCima(a: number, saida: number, batida: number): CurvaDaPassagem {
  const d = a + saida;
  const entrada = a + Math.min(batida, saida);
  return {
    volEntra: [[0, 0], [a * 0.4, 0.45], [a * 0.8, 0.7], [a, 0.85], [entrada, 1]],
    gravesEntra: [[0, CORTE_DB], [a, CORTE_DB], [entrada, 0]],
    mediosEntra: [[0, 0]],
    agudosEntra: [[0, -14], [a, -3], [entrada, 0]],
    volSai: [[0, 1], [a * 0.6, 1], [a, 0.8], [d, 0]],
    gravesSai: [[0, 0], [a * 0.5, 0], [a, CORTE_DB]],
    mediosSai: [[0, 0], [a * 0.6, 0], [a, -8], [d, -16]],
    agudosSai: [[0, 0], [a, 0], [d, -12]],
  };
}

/**
 * Na cauda: a que entra começa quase cheia, no tempo forte dela; a cauda da
 * que sai perde os graves logo (um baixo a soar por baixo de um bombo novo é
 * o que se ouve como confusão) e fecha os médios e os agudos ao desvanecer.
 */
function curvaNaCauda(f: number, compassoEntra: number): CurvaDaPassagem {
  return {
    volEntra: [[0, 0.9], [Math.min(f, compassoEntra), 1]],
    gravesEntra: [[0, 0]],
    mediosEntra: [[0, 0]],
    agudosEntra: [[0, 0]],
    volSai: [[0, 1], [f * 0.5, 0.55], [f, 0]],
    gravesSai: [[0, -8], [Math.min(0.5, f), CORTE_DB]],
    mediosSai: [[0, -4], [f, -16]],
    agudosSai: [[0, 0], [f, -14]],
  };
}

/**
 * Corte no "um": nos `preparacao` segundos antes, a que sai fecha como um
 * filtro a subir (perde os graves, depois os médios); no tempo forte sai em
 * `saida` segundos, e a que entra começa cheia.
 */
function curvaDeCorte(saida: number, preparacao: number): CurvaDaPassagem {
  return {
    volEntra: [[0, 0.92], [saida, 1]],
    gravesEntra: [[0, 0]],
    mediosEntra: [[0, 0]],
    agudosEntra: [[0, 0]],
    volSai: [[-preparacao, 1], [0, 1], [saida, 0]],
    gravesSai: [[-preparacao, 0], [-preparacao * 0.4, -14], [0, CORTE_DB]],
    mediosSai: [[-preparacao, 0], [-preparacao * 0.5, 0], [0, -10], [saida, -14]],
    agudosSai: [[-preparacao, 0], [0, 0], [saida, -6]],
  };
}

/**
 * Suave (sem batida clara, até 3 s): igual potência, com os graves trocados a
 * meio, a que entra a abrir os agudos e a que sai a fechar os médios -- um
 * filtro a passar de uma para a outra, e não um volume a cruzar.
 */
function curvaSuave(d: number): CurvaDaPassagem {
  return {
    ...igualPotencia(d),
    gravesEntra: [[0, CORTE_DB], [d * 0.45, CORTE_DB], [d * 0.6, 0]],
    mediosEntra: [[0, 0]],
    agudosEntra: [[0, -12], [d * 0.6, 0]],
    gravesSai: [[0, 0], [d * 0.45, 0], [d * 0.6, CORTE_DB]],
    mediosSai: [[0, 0], [d * 0.5, 0], [d, -12]],
    agudosSai: [[0, 0], [d, -8]],
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
  mediosSai: number; mediosEntra: number;
  agudosSai: number; agudosEntra: number;
};

/** A passagem num instante, em segundos desde o instante marcado (pode ser negativo). */
export function estadoDaPassagem(c: CurvaDaPassagem, t: number): EstadoDaPassagem {
  const depois = Math.max(0, t);
  return {
    volSai: noInstante(c.volSai, t), volEntra: noInstante(c.volEntra, depois),
    gravesSai: noInstante(c.gravesSai, t), gravesEntra: noInstante(c.gravesEntra, depois),
    mediosSai: noInstante(c.mediosSai, t), mediosEntra: noInstante(c.mediosEntra, depois),
    agudosSai: noInstante(c.agudosSai, t), agudosEntra: noInstante(c.agudosEntra, depois),
  };
}

/** Quantos segundos antes do instante marcado a que sai já começa a mudar. */
export function preparacaoDaCurva(c: CurvaDaPassagem): number {
  return Math.max(0, -Math.min(
    c.volSai[0]?.[0] ?? 0, c.gravesSai[0]?.[0] ?? 0, c.mediosSai[0]?.[0] ?? 0, c.agudosSai[0]?.[0] ?? 0,
  ));
}

/**
 * Os dez ganhos do equalizador (lib/equalizer.ts: a prateleira dos 105 Hz, os
 * 64, 125, 250, 500 Hz, 1, 2, 4 e 8 kHz, e a prateleira dos 10 kHz) com o
 * corte da passagem por cima do perfil da faixa. Os graves vão sobretudo à
 * prateleira de baixo; os médios aos 250 e 500 Hz (e um pouco ao 1 kHz); os
 * agudos à prateleira de cima, e menos aos 8, 4 e 2 kHz -- um corte que desce
 * de cima para baixo soa a um filtro a fechar.
 */
export function ganhosComPassagem(ganhos: readonly number[], gravesDb: number, mediosDb: number, agudosDb: number): number[] {
  const g = ganhos.slice(0, 10);
  while (g.length < 10) g.push(0);
  g[0] += gravesDb;
  g[1] += gravesDb * 0.5;
  g[2] += gravesDb * 0.35;
  g[3] += mediosDb;
  g[4] += mediosDb * 0.7;
  g[5] += mediosDb * 0.3;
  g[6] += agudosDb * 0.2;
  g[7] += agudosDb * 0.4;
  g[8] += agudosDb * 0.7;
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
    + `confidence ${p.confiancaSai.toFixed(1)} -> ${p.confiancaEntra.toFixed(1)} (min ${CONFIANCA_MINIMA}), `
    + `key ${p.tomSai ?? '?'} -> ${p.tomEntra ?? '?'}${p.semitons ? `, outgoing bent ${p.semitons > 0 ? '+' : ''}${p.semitons} st` : ''}`
    + `${p.acertoEntra !== 1 ? `, next nudged ${p.acertoEntra > 1 ? '+' : ''}${((p.acertoEntra - 1) * 100).toFixed(1)}%` : ''}, ${p.motivo}`;
}
