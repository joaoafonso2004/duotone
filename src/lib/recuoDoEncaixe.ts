/**
 * O recuo da capa 3D quando a face encaixa (29/9, variante B da preview
 * `docs/capa-encaixe-recuo.html`, escolhida pelo João).
 *
 * A música acaba de descarregar e a face pousa na caixa. Pousava a abrandar
 * (ease-out) e a caixa assentava 2 pt depois de ela parar: havia uma pausa entre
 * o contacto e o movimento. Agora a face chega a ACELERAR e bate; no fotograma
 * do contacto a caixa recua ao longo do próprio eixo e desce um pouco, e volta.
 *
 * O recuo é UMA mola que parte do sítio com a velocidade da face -- a ida e a
 * volta são o mesmo movimento, sem costura. Duas tentativas mostraram porquê:
 * uma ida cronometrada seguida de uma mola parecia dois movimentos colados, e
 * começar o recuo depois de a face parar parecia atrasado ("não está smooth").
 *
 * A mola é simulada aqui e entregue como uma curva amostrada, que o motor nativo
 * percorre com uma interpolação: o que corre no iPhone é exatamente o que se viu
 * na preview. Sem imports de runtime: testado em `scripts/test-recuo-do-encaixe.ts`.
 */

export const RECUO_DO_ENCAIXE = {
  /** O ponto mais recuado, em lados da capa, ao longo do eixo da caixa. */
  profundidade: 0.04,
  /** Quanto desce ao mesmo tempo, em pontos, como quem pousa. */
  desce: 2,
  /** A mola: rigidez e amortecimento (por segundo). Um pouco abaixo do crítico. */
  mola: { rigidez: 230, amortecimento: 21 },
  /** Quanto demora a face a chegar, a acelerar, desde onde estava. */
  baterMs: 380,
  /** O recuo inteiro, até a caixa estar parada no sítio. */
  duracaoMs: 1200,
  /** A flutuação volta depois do contacto, devagar. */
  vooDepoisMs: 200,
  vooMs: 1100,
} as const;

/** Onde a mola está, de 0 a 1 (1 = o ponto mais recuado), aos `ms` do contacto. */
export function recuoAos(ms: number, o: { rigidez: number; amortecimento: number } = RECUO_DO_ENCAIXE.mola): number {
  const tabela = tabelaDaMola(o);
  if (ms <= 0) return 0;
  const i = Math.floor(ms);
  if (i >= tabela.pontos.length - 1) return tabela.pontos[tabela.pontos.length - 1]! / tabela.pico;
  const a = tabela.pontos[i]!, b = tabela.pontos[i + 1]!;
  return (a + (b - a) * (ms - i)) / tabela.pico;
}

const cache = new Map<string, { pontos: number[]; pico: number }>();
/** A mola simulada ao milissegundo: parte de 0 com velocidade e volta a 0. */
function tabelaDaMola(o: { rigidez: number; amortecimento: number }) {
  const chave = `${o.rigidez}:${o.amortecimento}`;
  const feita = cache.get(chave);
  if (feita) return feita;
  const dt = 0.0005;
  const pontos: number[] = [];
  let x = 0, v = 1, pico = 0;
  for (let passo = 0; passo <= RECUO_DO_ENCAIXE.duracaoMs * 2; passo++) {
    // Um ponto por milissegundo; o pico é o dos pontos guardados, para o
    // milissegundo mais recuado valer exatamente 1.
    if (passo % 2 === 0) { pontos.push(x); if (x > pico) pico = x; }
    const a = -o.rigidez * x - o.amortecimento * v;
    v += a * dt;
    x += v * dt;
  }
  const tabela = { pontos, pico };
  cache.set(chave, tabela);
  return tabela;
}

/**
 * A curva para o `interpolate` nativo: de 0 (o contacto) a 1 (a caixa parada),
 * com o recuo normalizado (1 = o ponto mais recuado). Mais pontos no começo, onde
 * a mola muda depressa; o último é exatamente 0, para a caixa acabar no sítio.
 */
export function curvaDoRecuo(): { inputRange: number[]; outputRange: number[] } {
  const d = RECUO_DO_ENCAIXE.duracaoMs;
  const tempos: number[] = [];
  for (let ms = 0; ms < 240; ms += 6) tempos.push(ms);
  for (let ms = 240; ms < d; ms += 40) tempos.push(ms);
  tempos.push(d);
  return {
    inputRange: tempos.map((ms) => ms / d),
    outputRange: tempos.map((ms, i) => (i === tempos.length - 1 ? 0 : recuoAos(ms))),
  };
}
