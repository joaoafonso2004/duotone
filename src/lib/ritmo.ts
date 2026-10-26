/**
 * O ritmo de uma janela de música: andamento, onde caem as batidas e os tempos
 * fortes, e onde o som começa ou acaba. É o que o AutoMix (25/10) precisa para
 * passar de uma música para a outra na batida, como um DJ.
 *
 * O lado nativo (`analisarRitmo`, DuotoneAudioModule.swift) só LÊ: a energia de
 * cada quadro, nos graves e no total, de uma janela do ficheiro que já está em
 * disco. Tudo o que é decisão vive aqui, onde há testes -- a mesma divisão da
 * análise da cauda (`fimDaFaixa.ts`). `energiasPorQuadro` é a MESMA conta do
 * Swift, para os testes poderem gerar sinais e o `test-automix.ts` confirmar
 * que as constantes dos dois lados batem certo.
 *
 * Sem imports de runtime: corre em Node puro.
 */

/** Amostras por quadro. A 44,1 kHz são ~86 quadros por segundo. Igual no Swift. */
export const AMOSTRAS_POR_QUADRO = 512;
/** Onde acabam os graves (o bombo), em Hz. Dois filtros de um polo. Igual no Swift. */
export const CORTE_DOS_GRAVES_HZ = 150;
/** O chão em dB de um quadro sem som (0 em energia não atravessa a ponte). Igual no Swift. */
export const CHAO_DB = -120;
/**
 * Onde começam os agudos (os hi-hats, as palmas, a tarola), em Hz: um filtro
 * de um polo, e o que fica acima dele (26/10). Igual no Swift. No trap o 808
 * manda nos graves e no total, e a grelha agarrava-se a um 808 sincopado; os
 * agudos estão sempre em cima da batida.
 */
export const CORTE_DOS_AGUDOS_HZ = 2000;

/**
 * Abaixo disto não há batida que se possa seguir. Batidas sintéticas dão 16 a
 * 35, ruído 1,6 a 2,4 (`test-ritmo.ts`). Por calibrar com música a sério: o
 * relatório de reprodução diz a confiança de cada passagem.
 */
export const CONFIANCA_MINIMA = 3;

/**
 * Entre isto e a `CONFIANCA_MINIMA`, a batida vale se o andamento for ESTÁVEL
 * (26/10, relatório da 5.4.3: rap a 90-100 BPM com confiança 2,5 a 3,1, e 4
 * das 6 passagens a cair no "suave"). Uma confiança sozinha não separa uma
 * música com muita voz de ruído (o ruído chega a 2,6, e com volume variável
 * a 3,1); a estabilidade sim: as duas metades da janela, medidas sem a
 * preferência pelos 120 BPM (que alinhava o ruído nos 120), têm de dar o
 * mesmo andamento entre si e com a janela inteira. Em 80 amostras de ruído,
 * 0 passam (a fasquia de 3 sozinha deixa passar 1).
 */
export const CONFIANCA_COM_ESTABILIDADE = 2.3;

/** A batida desta janela serve para misturar? */
export const batidaSegura = (r: Pick<Ritmo, 'confianca' | 'estavel'>): boolean =>
  r.confianca >= CONFIANCA_MINIMA || (r.confianca >= CONFIANCA_COM_ESTABILIDADE && r.estavel === true);

/** O andamento procura-se entre estes dois valores. */
const BPM_MINIMO = 70;
const BPM_MAXIMO = 180;

export type EnergiasDaJanela = {
  /** Quadros por segundo. */
  fps: number;
  /** Onde a janela começa na faixa, em segundos. */
  inicioS: number;
  /** A energia média de cada quadro, em dB: só os graves, e tudo. */
  graves: number[];
  total: number[];
  /** Só os agudos (26/10), quando o nativo os mandar. */
  agudos?: number[];
  /** A força de cada uma das 12 notas na janela (dó, dó#, ..., si), quando o nativo a mandar. */
  croma?: number[];
};

export type Ritmo = {
  bpm: number;
  /** Segundos entre duas batidas. */
  periodoS: number;
  /**
   * Quanto as batidas se destacam do resto: a força média dos ataques em
   * cima da grelha a dividir pela força média em toda a janela. Ruído dá
   * perto de 1; um bombo e uma tarola certinhos, bem acima de 2.
   */
  confianca: number;
  /** Os tempos fortes (o "1" de cada compasso de quatro), em segundos na faixa. */
  temposFortesS: number[];
  /** Onde o som começa (janela do início) ou acaba (janela do fim), em segundos na faixa. */
  somS: number;
  /**
   * Onde a BATIDA começa (janela do início: o tempo forte do primeiro compasso
   * com ataques em cima da grelha) ou acaba (janela do fim: o fim do último).
   * Uma intro só com melodia, ou uma cauda que fica a soar, tem som mas não
   * tem batida -- e é por aí que um DJ junta duas músicas de andamentos
   * diferentes (26/10). Sem valor nos ritmos guardados antes disto.
   */
  batidaS?: number;
  /** A tonalidade da janela (26/10), quando o nativo manda as notas. */
  tom?: Tom;
  /** O andamento é o mesmo nas duas metades da janela (só se mede na zona cinzenta da confiança). */
  estavel?: boolean;
};

/**
 * Uma tonalidade: a tónica (0 = dó, ..., 11 = si), se é menor, e quanto o
 * perfil das notas se parece com o dela (a correlação, de -1 a 1).
 */
export type Tom = { tonica: number; menor: boolean; confianca: number };

/** Abaixo disto a tonalidade não se usa: as notas não dizem nenhuma com clareza. */
export const TOM_CONFIAVEL = 0.6;

/**
 * Os perfis de Krumhansl-Kessler: quanto cada grau da escala pesa numa
 * tonalidade maior e numa menor, medido com ouvintes (1982). Comparar as 12
 * notas de uma janela com os 24 perfis rodados dá a tonalidade mais parecida.
 */
const PERFIL_MAIOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const PERFIL_MENOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlacaoDePearson(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

/** A tonalidade de 12 notas (dó a si), ou `null` sem notas. */
export function tomDoCroma(croma: readonly number[] | null | undefined): Tom | null {
  if (!croma || croma.length !== 12 || !croma.every((x) => Number.isFinite(x)) || !(Math.max(...croma) > 0)) return null;
  let melhor: Tom | null = null;
  for (let tonica = 0; tonica < 12; tonica++) {
    // A nota i, vista da tónica: o grau (i - tónica) da escala.
    const rodada = croma.map((_, grau) => croma[(grau + tonica) % 12]);
    for (const menor of [false, true]) {
      const r = correlacaoDePearson(rodada, menor ? PERFIL_MENOR : PERFIL_MAIOR);
      if (!melhor || r > melhor.confianca) melhor = { tonica, menor, confianca: r };
    }
  }
  return melhor;
}

/**
 * A roda Camelot dos DJs: as 24 tonalidades em 12 números, com as quintas
 * lado a lado e a maior e a sua relativa menor no mesmo número (8B = dó
 * maior, 8A = lá menor). Duas casam se forem a mesma, a relativa, ou uma
 * quinta ao lado (o número ao lado, a mesma letra).
 */
export function camelot(t: Tom): { numero: number; letra: 'A' | 'B' } {
  const maior = t.menor ? (t.tonica + 3) % 12 : t.tonica;
  return { numero: ((maior * 7) % 12 + 7) % 12 + 1, letra: t.menor ? 'A' : 'B' };
}

/** Quantos passos na roda: 0 a mesma, 1 casam (relativa ou quinta), mais é choque. */
export function distanciaHarmonica(a: Tom, b: Tom): number {
  const ca = camelot(a), cb = camelot(b);
  const d = Math.abs(ca.numero - cb.numero) % 12;
  return Math.min(d, 12 - d) + (ca.letra === cb.letra ? 0 : 1);
}

/**
 * Os semitons (de -maximo a +maximo) que levam a tonalidade da que sai a
 * casar com a da que entra -- o menor que chegue --, ou `null` se nenhum
 * chega. 0 quando já casam.
 */
export function semitonsParaCasar(sai: Tom, entra: Tom, maximo = 2): number | null {
  if (distanciaHarmonica(sai, entra) <= 1) return 0;
  for (const s of [1, -1, 2, -2].filter((x) => Math.abs(x) <= maximo)) {
    if (distanciaHarmonica({ ...sai, tonica: (sai.tonica + s + 12) % 12 }, entra) <= 1) return s;
  }
  return null;
}

/** "8B", para o relatório. */
export const nomeDoTom = (t: Tom) => { const c = camelot(t); return `${c.numero}${c.letra}`; };

/** Um compasso tem batida com pelo menos isto da força dos compassos fortes. */
const PRESENCA_DA_BATIDA = 0.35;

/**
 * A energia de cada quadro, nos graves e no total, de amostras mono. É a conta
 * do Swift linha por linha: dois filtros passa-baixo de um polo para os graves,
 * e a média dos quadrados de cada quadro em dB.
 */
export function energiasPorQuadro(mono: ArrayLike<number>, taxa: number, inicioS = 0): EnergiasDaJanela {
  const a = 1 - Math.exp((-2 * Math.PI * CORTE_DOS_GRAVES_HZ) / taxa);
  const b = 1 - Math.exp((-2 * Math.PI * CORTE_DOS_AGUDOS_HZ) / taxa);
  let y1 = 0, y2 = 0, baixo = 0, somaGraves = 0, somaTotal = 0, somaAgudos = 0, n = 0;
  const graves: number[] = [], total: number[] = [], agudos: number[] = [];
  const emDb = (media: number) => (media > 0 ? Math.max(CHAO_DB, 10 * Math.log10(media)) : CHAO_DB);
  for (let i = 0; i < mono.length; i++) {
    const x = mono[i];
    y1 += a * (x - y1);
    y2 += a * (y1 - y2);
    baixo += b * (x - baixo);
    const alto = x - baixo;
    somaGraves += y2 * y2;
    somaTotal += x * x;
    somaAgudos += alto * alto;
    n++;
    if (n === AMOSTRAS_POR_QUADRO) {
      graves.push(emDb(somaGraves / n));
      total.push(emDb(somaTotal / n));
      agudos.push(emDb(somaAgudos / n));
      somaGraves = 0; somaTotal = 0; somaAgudos = 0; n = 0;
    }
  }
  return { fps: taxa / AMOSTRAS_POR_QUADRO, inicioS, graves, total, agudos };
}

/**
 * O que o nativo devolve. O `analisarRitmo` da 5.4.x: [fps, inicioS, graves0,
 * total0, graves1, total1, ...]. O `analisarRitmoComAgudos` (26/10): [3, fps,
 * inicioS, as 12 notas, graves0, total0, agudos0, graves1, ...] -- o 3 (as
 * bandas) à frente, que um fps nunca é.
 */
export function energiasDoNativo(plano: readonly number[]): EnergiasDaJanela | null {
  if (plano[0] === 3) {
    if (plano.length < 3 + 12 + 6) return null;
    const fps = plano[1], inicioS = plano[2];
    if (!(fps > 0) || !Number.isFinite(inicioS)) return null;
    const croma = plano.slice(3, 15);
    const graves: number[] = [], total: number[] = [], agudos: number[] = [];
    for (let i = 15; i + 2 < plano.length; i += 3) {
      graves.push(plano[i]);
      total.push(plano[i + 1]);
      agudos.push(plano[i + 2]);
    }
    return { fps, inicioS, graves, total, agudos, croma };
  }
  if (plano.length < 4) return null;
  const [fps, inicioS] = plano;
  if (!(fps > 0) || !Number.isFinite(inicioS)) return null;
  const graves: number[] = [], total: number[] = [];
  for (let i = 2; i + 1 < plano.length; i += 2) {
    graves.push(plano[i]);
    total.push(plano[i + 1]);
  }
  return { fps, inicioS, graves, total };
}

/**
 * A força dos ataques em cada quadro: quanto a energia SUBIU, nos graves (o
 * bombo) e no total (a tarola, os pratos). Só as subidas contam, e cada uma
 * no máximo 20 dB -- a entrada de uma música depois do silêncio não pode
 * valer por cem batidas. Tira-se a média local para o que fica ser o que
 * salta do resto.
 */
export function ataques(e: EnergiasDaJanela, pesos: { graves: number; total: number; agudos: number } = { graves: 1, total: 0.5, agudos: 0 }): number[] {
  const n = Math.min(e.graves.length, e.total.length);
  const bruto = new Array<number>(n).fill(0);
  const pico = e.total.reduce((m, v) => Math.max(m, v), CHAO_DB);
  const picoDosGraves = e.graves.reduce((m, v) => Math.max(m, v), CHAO_DB);
  const agudos = pesos.agudos > 0 && e.agudos && e.agudos.length >= n ? e.agudos : null;
  const picoDosAgudos = agudos ? agudos.reduce((m, v) => Math.max(m, v), CHAO_DB) : CHAO_DB;
  const calado = pico - 45;
  // Uma subida em dB não diz quão alto ficou: um prato baixinho depois de um
  // silêncio sobe tanto como o bombo. Cada subida pesa pelo nível a que
  // chegou, de 0 (40 dB abaixo do pico) a 1 (no pico).
  const peso = (v: number, p: number) => Math.min(1, Math.max(0, (v - (p - 40)) / 40));
  for (let t = 1; t < n; t++) {
    if (e.total[t] < calado) continue;
    const g = Math.min(20, Math.max(0, e.graves[t] - e.graves[t - 1])) * peso(e.graves[t], picoDosGraves);
    const s = Math.min(20, Math.max(0, e.total[t] - e.total[t - 1])) * peso(e.total[t], pico);
    const h = agudos ? Math.min(20, Math.max(0, agudos[t] - agudos[t - 1])) * peso(agudos[t], picoDosAgudos) : 0;
    bruto[t] = pesos.graves * g + pesos.total * s + pesos.agudos * h;
  }
  const meia = Math.max(1, Math.round(e.fps * 0.2));
  const saida = new Array<number>(n).fill(0);
  let soma = 0;
  for (let t = 0; t < n + meia; t++) {
    if (t < n) soma += bruto[t];
    if (t - 2 * meia - 1 >= 0) soma -= bruto[t - 2 * meia - 1];
    const centro = t - meia;
    if (centro < 0 || centro >= n) continue;
    const largura = Math.min(n - 1, centro + meia) - Math.max(0, centro - meia) + 1;
    saida[centro] = Math.max(0, bruto[centro] - soma / largura);
  }
  return saida;
}

/** O valor num instante fracionário, entre os dois quadros vizinhos. */
function entre(o: number[], x: number): number {
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= o.length) return 0;
  const f = x - i;
  return o[i] * (1 - f) + o[i + 1] * f;
}

/** A soma dos ataques numa grelha de período `p` quadros a começar em `fase`. */
function pente(o: number[], p: number, fase: number): number {
  let s = 0;
  for (let x = fase; x < o.length; x += p) s += entre(o, x);
  return s;
}

/**
 * O ritmo de uma janela, ou `null` sem batida que se veja.
 *
 * O andamento sai da autocorrelação dos ataques, com uma preferência suave
 * perto dos 120 BPM (a dúvida entre 70 e 140 é a de sempre), afinada depois
 * num pente fino. A fase é a do pente com mais força, e o tempo forte é, das
 * quatro batidas de cada compasso, a que tem mais bombo.
 */
export function ritmoDaJanela(e: EnergiasDaJanela, qual: 'inicio' | 'fim', semPreferencia = false): Ritmo | null {
  const o = ataques(e);
  const n = o.length;
  if (n < e.fps * 8) return null;

  // Onde o som começa ou acaba: o primeiro (ou último) quadro a menos de 35 dB
  // do pico.
  const pico = e.total.reduce((m, v) => Math.max(m, v), CHAO_DB);
  if (pico <= CHAO_DB + 1) return null;
  const limiar = pico - 35;
  let somQuadro = qual === 'inicio' ? e.total.findIndex((v) => v >= limiar) : -1;
  if (qual === 'fim') {
    for (let t = e.total.length - 1; t >= 0; t--) if (e.total[t] >= limiar) { somQuadro = t + 1; break; }
  }
  if (somQuadro < 0) return null;
  const somS = e.inicioS + somQuadro / e.fps;

  // 1. Autocorrelação nos atrasos de 70 a 180 BPM, somando os múltiplos de
  // cada um (26/10): o dobro (meio peso) e o compasso (4x). Num trap o 808
  // sincopado (bombos na 1.ª, 8.ª e 11.ª semicolcheia) dava mais força ao
  // intervalo entre dois 808 do que à batida -- 140 saía 81,7 (o trap
  // sintético do `test-ritmo.ts`; no relatório da 5.4.2 as músicas trap davam
  // confianças baixas). A batida verdadeira repete-se no compasso; um
  // intervalo sincopado não. É a soma de harmónicos dos detetores a sério.
  // Dois compassos (8x) acertavam o mesmo e custavam o dobro: 45 ms por
  // janela sem JIT, contra 21 sem harmónicos e 77 com os 8x. Só os atrasos
  // precisos, com memória: o JavaScript não pode ficar preso (energia-ios.md).
  const menor = Math.floor((60 / BPM_MAXIMO) * e.fps);
  const maior = Math.ceil((60 / BPM_MINIMO) * e.fps);
  const correlacoes = new Map<number, number>();
  const correlacao = (atraso: number) => {
    if (atraso >= n) return 0;
    let v = correlacoes.get(atraso);
    if (v == null) {
      let s = 0;
      for (let t = 0; t + atraso < n; t++) s += o[t] * o[t + atraso];
      v = s / (n - atraso);
      correlacoes.set(atraso, v);
    }
    return v;
  };
  // O atraso é inteiro e o período verdadeiro está a meio quadro dele: o
  // k-ésimo múltiplo pode estar a k/2 quadros do pico, e os picos dos
  // ataques têm um ou dois quadros. Procura-se o pico nessa folga.
  const noPico = (centro: number, folga: number) => {
    let m = 0;
    for (let x = centro - folga; x <= centro + folga; x++) m = Math.max(m, correlacao(x));
    return m;
  };
  let melhorAtraso = 0, melhorValor = -Infinity;
  for (let atraso = menor; atraso <= maior; atraso++) {
    const bpm = (60 * e.fps) / atraso;
    const preferencia = semPreferencia ? 1 : Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.7) ** 2);
    const forca = correlacao(atraso) + 0.5 * noPico(2 * atraso, 1) + noPico(4 * atraso, 2);
    const v = forca * preferencia;
    if (v > melhorValor) { melhorValor = v; melhorAtraso = atraso; }
  }
  if (!(melhorValor > 0)) return null;

  // 2. O pente: o período exato e a fase. Primeiro ±3 % em passos de 0,25
  // BPM e a fase de quadro em quadro, depois à volta do melhor em passos
  // finos. De uma vez só, em passos finos, eram dez vezes mais contas -- e
  // isto corre no JavaScript, que não pode ficar preso (energia-ios.md).
  let periodo = melhorAtraso, fase = 0, forca = -Infinity;
  // A FASE grossa pelos agudos, quando os há (26/10): os hi-hats e as palmas
  // estão sempre em cima da batida, e um 808 sincopado não -- nos graves e no
  // total ele mandava, e a grelha caía três semicolcheias ao lado do "um". O
  // acerto fino (±1 quadro) volta aos ataques de sempre, que se alinham com o
  // bombo: é por eles que o tempo forte se escolhe.
  const oFase = e.agudos ? ataques(e, { graves: 0.3, total: 0.3, agudos: 1 }) : o;
  const provar = (bpm: number, f: number, curva = oFase) => {
    const p = (60 * e.fps) / bpm;
    const s = pente(curva, p, f) / Math.max(1, Math.floor((n - f) / p));
    if (s > forca) { forca = s; periodo = p; fase = f; }
  };
  const bpmGrosso = (60 * e.fps) / melhorAtraso;
  for (let bpm = bpmGrosso * 0.97; bpm <= bpmGrosso * 1.03; bpm += 0.25) {
    const p = (60 * e.fps) / bpm;
    for (let f = 0; f < p; f += 1) provar(bpm, f);
  }
  const bpmA = (60 * e.fps) / periodo, faseA = fase;
  forca = -Infinity;
  for (let bpm = bpmA - 0.25; bpm <= bpmA + 0.25; bpm += 0.02) {
    for (let f = Math.max(0, faseA - 1); f <= faseA + 1; f += 0.1) provar(bpm, f, o);
  }
  // A fase vale módulo um período: quase um período inteiro é o mesmo que
  // quase zero, e aí a grelha deixava de fora a primeira batida da janela.
  if (fase > periodo - 1) fase -= periodo;
  // A confiança compara a grelha escolhida com a MESMA grelha em todas as
  // fases. Contra a média simples dos ataques, o ruído passava por batida: de
  // tantas grelhas provadas, alguma calha sempre em cima de picos ao acaso.
  let somaDasFases = 0, fasesProvadas = 0;
  for (let f = 0; f < periodo; f += 1) {
    somaDasFases += pente(o, periodo, f) / Math.max(1, Math.floor((n - f) / periodo));
    fasesProvadas++;
  }
  const mediaDasFases = somaDasFases / Math.max(1, fasesProvadas);
  const confianca = mediaDasFases > 0 ? forca / mediaDasFases : 0;

  // 3. O tempo forte: das quatro batidas, a com mais bombo (subida nos graves).
  const bombo = (t: number) => Math.max(0, (e.graves[Math.round(t)] ?? CHAO_DB) - (e.graves[Math.round(t) - 1] ?? CHAO_DB));
  const porPosicao = [0, 0, 0, 0];
  let b = 0;
  for (let x = fase; x < n; x += periodo, b++) porPosicao[b % 4] += Math.min(20, bombo(x));
  const forte = porPosicao.indexOf(Math.max(...porPosicao));
  const temposFortesS: number[] = [];
  for (let x = fase + forte * periodo; x < n; x += periodo * 4) temposFortesS.push(e.inicioS + Math.max(0, x) / e.fps);

  const bpm = (60 * e.fps) / periodo;
  const batidaS = ondeHaBatida(o, e, fase + forte * periodo, periodo, qual, somS);
  const tom = tomDoCroma(e.croma);
  // A estabilidade só se mede onde decide: na zona cinzenta da confiança.
  const bpmDaJanela = (60 * e.fps) / periodo;
  const estavel = !semPreferencia && confianca >= CONFIANCA_COM_ESTABILIDADE && confianca < CONFIANCA_MINIMA
    ? andamentoEstavel(e, qual, bpmDaJanela) : undefined;
  return {
    bpm, periodoS: periodo / e.fps, confianca, temposFortesS, somS, batidaS,
    ...(tom ? { tom } : {}), ...(estavel != null ? { estavel } : {}),
  };
}

/** O mesmo andamento, contando o dobro e a metade, a menos de 1,5 %. */
const mesmoAndamento = (a: number, b: number) => [a / b, (a * 2) / b, a / (2 * b)].some((r) => Math.abs(r - 1) < 0.015);

/**
 * As duas metades da janela, sem a preferência pelos 120 BPM, dão o mesmo
 * andamento entre si e com a janela inteira? Ver `CONFIANCA_COM_ESTABILIDADE`.
 */
function andamentoEstavel(e: EnergiasDaJanela, qual: 'inicio' | 'fim', bpm: number): boolean {
  const n = Math.min(e.graves.length, e.total.length), m = Math.floor(n / 2);
  const metade = (desde: number, ate: number): EnergiasDaJanela => ({
    fps: e.fps, inicioS: e.inicioS + desde / e.fps,
    graves: e.graves.slice(desde, ate), total: e.total.slice(desde, ate),
    ...(e.agudos ? { agudos: e.agudos.slice(desde, ate) } : {}),
  });
  const a = ritmoDaJanela(metade(0, m), qual, true);
  const b = ritmoDaJanela(metade(m, n), qual, true);
  return !!a && !!b && mesmoAndamento(a.bpm, b.bpm) && mesmoAndamento(a.bpm, bpm) && mesmoAndamento(b.bpm, bpm);
}

/**
 * Onde a batida começa ou acaba, de compasso em compasso: a força dos ataques
 * em cima das quatro batidas de cada compasso, contra os compassos fortes da
 * janela (o percentil 75). Dois compassos seguidos com batida contam -- um
 * prato solto numa intro não é a batida a entrar. Sem nada claro, o primeiro
 * tempo forte (início) ou o fim do som (fim).
 */
function ondeHaBatida(o: number[], e: EnergiasDaJanela, primeiro: number, periodo: number, qual: 'inicio' | 'fim', somS: number): number {
  const compasso = periodo * 4;
  const forcas: { inicio: number; forca: number }[] = [];
  for (let x = primeiro; x + compasso <= o.length; x += compasso) {
    let s = 0;
    for (let j = 0; j < 4; j++) {
      const c = x + j * periodo;
      s += Math.max(entre(o, c - 1), entre(o, c), entre(o, c + 1));
    }
    forcas.push({ inicio: x, forca: s / 4 });
  }
  const emSegundos = (quadro: number) => e.inicioS + quadro / e.fps;
  const ordenadas = forcas.map((f) => f.forca).sort((a, b) => a - b);
  const referencia = ordenadas[Math.floor(ordenadas.length * 0.75)] ?? 0;
  if (forcas.length < 2 || !(referencia > 0)) return qual === 'inicio' ? emSegundos(primeiro) : somS;
  const tem = forcas.map((f) => f.forca >= referencia * PRESENCA_DA_BATIDA);
  if (qual === 'inicio') {
    const k = tem.findIndex((x, i) => x && tem[i + 1]);
    return emSegundos(forcas[k >= 0 ? k : 0].inicio);
  }
  for (let k = tem.length - 1; k > 0; k--) {
    if (tem[k] && tem[k - 1]) return Math.min(somS, emSegundos(forcas[k].inicio + compasso));
  }
  return somS;
}

/**
 * Um ritmo em seis números, para o guardar no aparelho (`ritmoGuardado.ts`):
 * os tempos fortes são uma grelha certa (de compasso em compasso a partir do
 * primeiro), e por isso refazem-se em vez de se guardarem um a um. O sétimo é
 * onde há batida, e o oitavo ao décimo a tonalidade (26/10).
 */
export type RitmoCompacto = number[] | null;

const arredondar = (x: number) => Math.round(x * 1000) / 1000;

export function compactar(r: Ritmo | null): RitmoCompacto {
  if (!r) return null;
  const base: [number, number, number, number, number, number] = [arredondar(r.bpm), r.periodoS, arredondar(r.confianca), r.temposFortesS[0] ?? r.somS, r.temposFortesS.length, arredondar(r.somS)];
  if (r.batidaS == null) return base;
  const comBatida = [...base, arredondar(r.batidaS)];
  // A tonalidade (sem ela, -1) e a estabilidade (1, 0, ou -1 sem medir).
  const tom = r.tom ? [r.tom.tonica, r.tom.menor ? 1 : 0, arredondar(r.tom.confianca)] : [-1, 0, 0];
  return [...comBatida, ...tom, r.estavel == null ? -1 : r.estavel ? 1 : 0];
}

export function descompactar(c: unknown): Ritmo | null {
  if (!Array.isArray(c) || ![6, 7, 10, 11].includes(c.length) || !c.every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  const [bpm, periodoS, confianca, primeiro, fortes, somS, batidaS, tonica, menor, confiancaDoTom, estavel] = c as number[];
  if (!(periodoS > 0)) return null;
  const temposFortesS = Array.from({ length: Math.max(0, Math.floor(fortes)) }, (_, k) => primeiro + k * periodoS * 4);
  const tom = tonica != null && tonica >= 0 ? { tonica, menor: menor === 1, confianca: confiancaDoTom } : null;
  return {
    bpm, periodoS, confianca, temposFortesS, somS, ...(batidaS != null ? { batidaS } : {}), ...(tom ? { tom } : {}),
    ...(estavel === 1 || estavel === 0 ? { estavel: estavel === 1 } : {}),
  };
}
