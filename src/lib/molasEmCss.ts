/**
 * As molas do iPhone (`movimento.ts`) em CSS, para o PC se mexer com a MESMA
 * física (S1 da auditoria de 31/10; o João: "faz, desde que não fique podre").
 *
 * O CSS não tem molas, mas tem `linear()` (Chromium 113+; o Electron 44 tem-no):
 * uma curva por pontos. Simula-se cada mola de 0 a 1, mede-se quando assenta, e
 * ficam só os pontos que a reta entre vizinhos não explica (Douglas-Peucker).
 * Sai um bloco de variáveis para o `injectDesktopDocumentStyles` e para a janela
 * do mini leitor:
 *
 *   --dt-premir: linear(…);  --dt-premir-ms: 423ms;
 *
 * Para não ficar "podre", as durações da coreografia do PC (uma página a entrar
 * em 260 ms, o painel em 240 ms) ficam: muda a CURVA, que passa a ser a forma
 * de uma destas molas. Esticar ou encolher uma curva de mola no tempo é a mesma
 * mola mais rígida ou mais mole, com o mesmo amortecimento -- a mesma física.
 * Onde a mola é o gesto (carregar e largar um botão, um ícone que muda de
 * estado), usa-se a duração dela, como no iPhone.
 *
 * Calcula-se uma vez, no arranque (umas 8000 iterações por mola, < 2 ms), em
 * vez de um ficheiro gerado: a curva nunca se afasta do `movimento.ts`.
 *
 * Sem React: `scripts/test-movimento-do-pc.ts`; `scripts/gerar-molas-do-pc.ts`
 * imprime o bloco.
 */
import { ENTRADA, ESTADO, PREMIR, SOLTAR, type Mola } from './movimento';

const PASSO_S = 1 / 2000;
/** Assentou: a menos de 0,2 % do destino e quase parada, e daí em diante não sai. */
const PERTO = 0.002;
const PARADA = 0.01;
/** O erro que se aceita ao tirar um ponto (em unidades de 0 a 1). */
const ERRO = 0.0025;

type Ponto = { t: number; x: number };
export type CurvaCss = { ms: number; curva: string; pico: number };

function simular(m: Mola): { pontos: Ponto[]; duracaoS: number } {
  const pontos: Ponto[] = [{ t: 0, x: 0 }];
  let x = 0, v = 0, t = 0, assentouEm = -1;
  while (t < 3) {
    // Euler semi-implícito: estável a este passo para as rigidezes da app.
    const a = (-m.stiffness * (x - 1) - m.damping * v) / m.mass;
    v += a * PASSO_S; x += v * PASSO_S; t += PASSO_S;
    pontos.push({ t, x });
    const quieta = Math.abs(x - 1) < PERTO && Math.abs(v) < PARADA;
    if (quieta && assentouEm < 0) assentouEm = t;
    if (!quieta) assentouEm = -1;
    if (assentouEm > 0 && t - assentouEm > 0.05) break;
  }
  return { pontos, duracaoS: assentouEm };
}

/** Douglas-Peucker: fica o ponto mais longe da reta, e repete-se dos dois lados. */
function simplificar(p: Ponto[], i: number, j: number, fica: Set<number>) {
  let pior = -1, distancia = 0;
  for (let k = i + 1; k < j; k++) {
    const f = (p[k].t - p[i].t) / (p[j].t - p[i].t);
    const d = Math.abs(p[i].x + f * (p[j].x - p[i].x) - p[k].x);
    if (d > distancia) { distancia = d; pior = k; }
  }
  if (distancia <= ERRO) return;
  fica.add(pior);
  simplificar(p, i, pior, fica);
  simplificar(p, pior, j, fica);
}

function emLinear(pontos: Ponto[], duracaoS: number): string {
  const ate = pontos.filter((p) => p.t <= duracaoS);
  ate[ate.length - 1] = { t: duracaoS, x: 1 };
  const fica = new Set([0, ate.length - 1]);
  simplificar(ate, 0, ate.length - 1, fica);
  const curva = [...fica].sort((a, b) => a - b).map((k) => {
    const { t, x } = ate[k];
    return k === 0 ? '0' : k === ate.length - 1 ? '1' : `${+x.toFixed(4)} ${+((t / duracaoS) * 100).toFixed(2)}%`;
  });
  return `linear(${curva.join(', ')})`;
}

function daMola(m: Mola): CurvaCss {
  const { pontos, duracaoS } = simular(m);
  return { ms: Math.round(duracaoS * 1000), curva: emLinear(pontos, duracaoS), pico: Math.max(...pontos.map((p) => p.x)) };
}

/**
 * O travão do prato (o pause do Metal escovado): não é mola, é o `Animated.decay`
 * do iPhone, que perde velocidade por milissegundo. A posição normalizada é
 * 1 - d^t, e assenta quando falta 0,2 %.
 */
const DESACELERACAO = 0.994;
function doTravao(): CurvaCss {
  const ms = Math.log(PERTO) / Math.log(DESACELERACAO);
  const pontos: Ponto[] = [];
  for (let t = 0; t <= ms; t += 0.5) pontos.push({ t: t / 1000, x: 1 - DESACELERACAO ** t });
  return { ms: Math.round(ms), curva: emLinear(pontos, ms / 1000), pico: 1 };
}

let calculadas: Record<NomeDaCurva, CurvaCss> | null = null;
export type NomeDaCurva = 'premir' | 'soltar' | 'estado' | 'entrada' | 'travar' | 'sair';

/**
 * As seis curvas do PC. `sair` é a única que não é mola: o que sai acelera e
 * desaparece (o "sair com calma" do `movimento.ts` é para quem fica), 160 ms.
 */
export function curvasDoPc(): Record<NomeDaCurva, CurvaCss> {
  if (!calculadas) {
    calculadas = {
      premir: daMola(PREMIR), soltar: daMola(SOLTAR), estado: daMola(ESTADO), entrada: daMola(ENTRADA),
      travar: doTravao(), sair: { ms: 160, curva: 'cubic-bezier(.5, 0, .75, 0)', pico: 1 },
    };
  }
  return calculadas;
}

/** Uma curva para a Web Animations API, que não lê variáveis CSS. */
export function curvaDoPc(nome: NomeDaCurva): string {
  return curvasDoPc()[nome].curva;
}

/**
 * O bloco `:root` com as seis (`--dt-<nome>` e `--dt-<nome>-ms`), mais as duas
 * de sempre do PC agora como molas: `--dt-curva` (a de quase tudo, um ease-out)
 * é a forma da ENTRADA, e `--dt-mola` (a que passa do sítio) é a do SOLTAR.
 */
export function cssDasMolas(): string {
  const c = curvasDoPc();
  const linhas = (Object.keys(c) as NomeDaCurva[]).map((n) => `--dt-${n}: ${c[n].curva}; --dt-${n}-ms: ${c[n].ms}ms;`);
  return `:root{ ${linhas.join(' ')} --dt-curva: var(--dt-entrada); --dt-mola: var(--dt-soltar); }`;
}
