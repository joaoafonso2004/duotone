/**
 * A capa de metal em 3D do Now Playing do PC (5/11, opção das Definições
 * "3D metal cover", desligada de origem). Escolhida pelo João numa maquete
 * (`docs/capa-3d-pc-maquete.html`): a pose da Floating 3D do iPhone, as
 * arestas em metal escovado SEM reflexos, e duas coisas que só o rato dá:
 *
 *  - **o lado onde está o rato afunda** ("onde eu passo o rato afunda e não
 *    vem para perto"), até 6°;
 *  - **agarrar e arrastar roda a caixa**, sem limite, até à letra no verso.
 *    Largada devagar acaba a meia volta ou volta atrás (as regras do cubo da
 *    app, `lyricsCubeGesture.ts`); lançada, continua a rodar e trava numa face.
 *
 * Desde 7/11 (`docs/capa-3d-arestas-maquete.html`) as arestas são a CAPA, como
 * no iPhone, e há um brilho que corre por elas quando a caixa inclina ou roda
 * (`brilhoDaAresta`). A opção passou a chamar-se "3D cover".
 *
 * Só contas, sem imports de runtime: testadas em `scripts/test-capa-metal-3d.ts`.
 * Quem desenha é `desktop/CapaMetal3D.web.tsx`.
 */
import { CAPA_FLUTUANTE } from './capaFlutuante3D';
import type { Mola } from './movimento';
import type { LadoDaCaixa } from './ocultacao';

/** A pose de repouso: a mesma do iPhone (vê-se a aresta esquerda e a de baixo). */
export const POSE_DO_METAL = {
  rotateX: CAPA_FLUTUANTE.rotateX,
  rotateY: CAPA_FLUTUANTE.rotateY,
  rotateZ: CAPA_FLUTUANTE.rotateZ,
  escala: CAPA_FLUTUANTE.scale,
  /** Em lados da capa. */
  deslocacaoX: CAPA_FLUTUANTE.deslocacaoX,
  deslocacaoY: CAPA_FLUTUANTE.deslocacaoY,
  espessura: CAPA_FLUTUANTE.espessura,
  perspectiva: CAPA_FLUTUANTE.perspectiva,
} as const;

/** Quanto o rato inclina a caixa, em graus (o João: "podes implementar com 6 graus"). */
export const INCLINACAO_MAXIMA = 6;

/**
 * À volta da capa há uma margem onde o rato ainda conta, em lados da capa.
 * Fora dela a caixa volta à pose.
 */
export const MARGEM_DO_RATO = 0.45;

/**
 * Onde está o rato em relação à capa, de -1 a 1 em cada eixo, ou `null` fora da
 * zona. `centro` é o centro da capa no ecrã, `lado` o lado dela em píxeis.
 */
export function ratoNaCapa(
  x: number, y: number, centro: { x: number; y: number }, lado: number,
): { nx: number; ny: number } | null {
  if (!(lado > 0)) return null;
  const margem = lado * MARGEM_DO_RATO;
  const meio = lado / 2 + margem;
  if (Math.abs(x - centro.x) >= meio || Math.abs(y - centro.y) >= meio) return null;
  // A inclinação toda chega a meio da margem: na aresta da capa já se sente bem.
  const escala = lado / 2 + margem * 0.5;
  const limitar = (v: number) => Math.max(-1, Math.min(1, v));
  return { nx: limitar((x - centro.x) / escala), ny: limitar((y - centro.y) / escala) };
}

/**
 * Os ângulos que a caixa procura com o rato em (nx, ny). O lado do rato AFUNDA:
 * com o rato em cima à direita, a aresta de cima e a da direita vão para trás
 * (`rotateX` e `rotateY` sobem, nas contas do CSS: y para baixo, z para quem vê).
 */
export function inclinacao(
  rato: { nx: number; ny: number } | null, maximo = INCLINACAO_MAXIMA,
): { rotateX: number; rotateY: number } {
  if (!rato) return { rotateX: POSE_DO_METAL.rotateX, rotateY: POSE_DO_METAL.rotateY };
  return {
    rotateX: POSE_DO_METAL.rotateX - rato.ny * maximo,
    rotateY: POSE_DO_METAL.rotateY + rato.nx * maximo,
  };
}

/** Os mesmos limiares do cubo: 20 % do caminho, ou um gesto de 0,35 px/ms. */
export const LIMIAR_DO_CAMINHO = 0.2;
export const LIMIAR_DO_GESTO = 0.35;
/** Parado mais do que isto antes de largar não é lançar. */
export const PAUSA_QUE_NAO_LANCA_MS = 60;
/**
 * Quanto um lançamento continua a rodar sozinho, em segundos de velocidade.
 * Medido na maquete: um gesto rápido curto vira uma face, um forte dá voltas.
 */
export const IMPULSO_S = 0.16;

/** Arrastar uma capa de largura dá meia volta. */
export function anguloDoArrasto(inicio: number, dx: number, lado: number): number {
  return inicio + (dx / Math.max(1, lado)) * 180;
}

/** A velocidade de um arrasto em graus por segundo, a partir de px/ms. */
export function grausPorSegundo(vxPxMs: number, lado: number): number {
  return (vxPxMs * 1000 / Math.max(1, lado)) * 180;
}

/**
 * Onde a caixa pousa ao largar: sempre num múltiplo de 180° (0 é a capa, 180 a
 * letra, e as voltas inteiras somam-se).
 *
 * - Lançada (`|vx| > 0,35 px/ms`): continua no sentido do gesto e trava na face
 *   seguinte ao sítio onde o impulso a levaria.
 * - Largada devagar: a regra dos 20 % a contar da face de onde se partiu, no
 *   sentido em que ia. `sentido` é o do último movimento (±1).
 * - Parada antes de largar (`msParada`): a velocidade não conta.
 */
export function destinoAoLargar(
  { angulo, vxPxMs, msParada, sentido, lado }:
  { angulo: number; vxPxMs: number; msParada: number; sentido: number; lado: number },
): number {
  const vx = msParada > PAUSA_QUE_NAO_LANCA_MS ? 0 : vxPxMs;
  if (Math.abs(vx) > LIMIAR_DO_GESTO) {
    const lanca = angulo + grausPorSegundo(vx, lado) * IMPULSO_S;
    return (vx > 0 ? Math.ceil(lanca / 180) : Math.floor(lanca / 180)) * 180 + 0;
  }
  const baixo = Math.floor(angulo / 180) * 180;
  const fracao = (angulo - baixo) / 180;
  if (fracao === 0) return baixo + 0;
  if ((sentido || 1) > 0) return (fracao > LIMIAR_DO_CAMINHO ? baixo + 180 : baixo) + 0;
  return (1 - fracao > LIMIAR_DO_CAMINHO ? baixo : baixo + 180) + 0;
}

/** Se um ângulo mostra a letra (o verso para quem vê). */
export function mostraALetra(angulo: number): boolean {
  const a = ((angulo % 360) + 360) % 360;
  return a > 90 && a < 270;
}

/** O mesmo lado com o ângulo curto: 0 ou 180. Depois de assentar, as voltas esquecem-se. */
export function anguloCurto(angulo: number): number {
  return mostraALetra(angulo) ? 180 : 0;
}

/**
 * Para onde rodar quando o lado muda por outra porta (os pontos, o teclado):
 * o ângulo do lado pedido mais perto de onde a caixa está, para a frente
 * quando os dois ficam à mesma distância.
 */
export function anguloDoLado(agora: number, letra: boolean): number {
  const base = letra ? 180 : 0;
  const k = Math.round((agora - base) / 360);
  const candidatos = [base + (k - 1) * 360, base + k * 360, base + (k + 1) * 360];
  let melhor = candidatos[0];
  for (const c of candidatos) {
    const d = Math.abs(c - agora), dm = Math.abs(melhor - agora);
    if (d < dm || (d === dm && c > melhor)) melhor = c;
  }
  return melhor + 0;
}

/**
 * Uma mola num passo (Euler semi-implícito), nas unidades de quem a usa (graus).
 * As molas são as da app (`movimento.ts`): ESTADO a seguir o rato, SOLTAR a
 * voltar à pose, ENTRADA ao virar.
 */
export type EstadoDaMola = { x: number; v: number; alvo: number };
export function passoDaMola(m: EstadoDaMola, mola: Mola, dt: number): void {
  const a = (-mola.stiffness * (m.x - m.alvo) - mola.damping * m.v) / mola.mass;
  m.v += a * dt;
  m.x += m.v * dt;
}
export function molaAssente(m: EstadoDaMola): boolean {
  return Math.abs(m.x - m.alvo) < 0.004 && Math.abs(m.v) < 0.004;
}

/**
 * A mola de uma volta lançada, mais mole do que a ENTRADA para as voltas se
 * verem (afinada na maquete; amortecimento a ~0,9 do crítico, sem ressalto).
 */
export const LANCAR: Mola = { stiffness: 80, damping: 16, mass: 1 };

// ------------------------------------------------------------ o brilho --
/**
 * O brilho nas arestas (7/11, o João: "adiciona um brilho na aresta que muda de
 * sítio à medida que mexe"; a maquete `docs/capa-3d-arestas-maquete.html`).
 *
 * Uma luz ao longe, à esquerda, um pouco acima e à frente. Cada aresta tem um
 * ponto quente: na pose de repouso fica onde a luz a apanha, e CORRE ao longo
 * dela quando a aresta roda em direção à luz (2,5x: 6° de rato são um quarto da
 * aresta). A força é quanto o canto (meio caminho entre a face e a lateral), ou
 * a lateral, aponta para o meio entre a luz e quem vê.
 *
 * Direções da caixa: x para a direita, y para baixo, z para quem vê. A ordem é a
 * do transform: rotateY(virar) primeiro, depois rotateZ, rotateY e rotateX.
 */
export const FORCA_DO_BRILHO = 0.7;
/** O comprimento do ponto quente, em lados: o fio (na borda) e o lustro (na espessura). */
export const COMPRIMENTO_DO_FIO = 0.36;
export const COMPRIMENTO_DO_LUSTRO = 0.42;

type Vetor = [number, number, number];
const rad = (g: number) => (g * Math.PI) / 180;
const unitario = (v: Vetor): Vetor => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const escalar = (a: Vetor, b: Vetor) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function rodar(v: Vetor, rx: number, ry: number, rz: number, virar: number): Vetor {
  let [x, y, z] = v, c: number, s: number;
  c = Math.cos(rad(virar)); s = Math.sin(rad(virar)); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(rad(rz)); s = Math.sin(rad(rz)); [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(rad(ry)); s = Math.sin(rad(ry)); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(rad(rx)); s = Math.sin(rad(rx)); [y, z] = [y * c - z * s, y * s + z * c];
  return [x, y, z];
}
const LUZ: Vetor = unitario([-0.5, -0.35, 1]);
const MEIO: Vetor = unitario([LUZ[0], LUZ[1], LUZ[2] + 1]);
/** Para onde aponta cada lateral, e ao longo de quê corre a aresta (de cima para baixo, da esquerda para a direita). */
const LADOS: Record<LadoDaCaixa, { n: Vetor; t: Vetor }> = {
  esq: { n: [-1, 0, 0], t: [0, 1, 0] }, dir: { n: [1, 0, 0], t: [0, 1, 0] },
  cima: { n: [0, -1, 0], t: [1, 0, 0] }, baixo: { n: [0, 1, 0], t: [1, 0, 0] },
};
const suave = (a: number, b: number, x: number) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const NO_REPOUSO = Object.fromEntries((Object.keys(LADOS) as LadoDaCaixa[]).map((l) => [
  l, escalar(MEIO, rodar(LADOS[l].t, POSE_DO_METAL.rotateX, POSE_DO_METAL.rotateY, POSE_DO_METAL.rotateZ, 0)),
])) as Record<LadoDaCaixa, number>;

/**
 * O brilho de uma aresta. `face` é +1 a da frente, -1 o verso. `u` vai de 0 a 1
 * ao longo da aresta (de cima para baixo, da esquerda para a direita, nas
 * direções da caixa); `canto` é a força do fio na borda, `lateral` a do lustro.
 */
export function brilhoDaAresta(
  lado: LadoDaCaixa, face: 1 | -1, pose: { rotateX: number; rotateY: number; rotateZ: number; virar: number },
): { u: number; canto: number; lateral: number } {
  const { n, t } = LADOS[lado];
  const { rotateX: rx, rotateY: ry, rotateZ: rz, virar } = pose;
  const d = escalar(MEIO, rodar(t, rx, ry, rz, virar)), r = NO_REPOUSO[lado];
  return {
    u: Math.min(0.94, Math.max(0.06, 0.5 + 0.35 * r + 2.5 * (d - r))),
    canto: suave(0.3, 0.95, escalar(rodar(unitario([n[0], n[1], face]), rx, ry, rz, virar), MEIO)),
    lateral: suave(0.1, 0.9, escalar(rodar(n, rx, ry, rz, virar), MEIO)),
  };
}

/**
 * Copia a borda do canvas do efeito para as laterais. Só quando a capa mexe:
 * em repouso o efeito desenha a capa limpa, que as laterais já têm, e a chamada
 * volta logo para trás -- parada, a caixa continua a não custar nada.
 *
 * As laterais mostram a faixa da borda espelhada (`geometriaDaLateral`): a da
 * esquerda são as primeiras colunas, a da direita as últimas, e assim por diante.
 * O espelho é o CSS que o faz, como na faixa da imagem. Quem desenha é
 * `desktop/CapaMetal3D.web.tsx`; testado com telas a fingir em `test-capa-metal-3d.ts`.
 */
export function criarArestasDoEfeito(lado: () => number): {
  guardar: (qual: LadoDaCaixa, tela: HTMLCanvasElement | null) => void;
  aoDesenhar: (tela: HTMLCanvasElement | null, limpa: boolean) => void;
} {
  const telas = new Map<LadoDaCaixa, HTMLCanvasElement>();
  const contextos = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D | null>();
  let fonte: HTMLCanvasElement | null = null;
  let limpaAntes = true;
  const esconder = () => { for (const c of telas.values()) c.style.opacity = '0'; };
  const guardar = (qual: LadoDaCaixa, tela: HTMLCanvasElement | null) => {
    if (!tela) { telas.delete(qual); return; }
    if (telas.get(qual) !== tela) fonte = null; // uma tela nova ainda não tem nada: copia no próximo quadro
    telas.set(qual, tela);
  };
  const aoDesenhar = (tela: HTMLCanvasElement | null, limpa: boolean) => {
    if (!tela) { fonte = null; esconder(); return; }
    if (tela === fonte && limpa && limpaAntes) return;
    const k = tela.width / lado();
    // A espessura em píxeis do canvas: a faixa que a imagem mostra na aresta (`geometriaDaLateral`).
    const banda = Math.max(1, Math.round(lado() * POSE_DO_METAL.espessura * k));
    for (const [qual, c] of telas) {
      const vertical = qual === 'esq' || qual === 'dir';
      const w = vertical ? banda : tela.width;
      const h = vertical ? tela.height : banda;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      let ctx = contextos.get(c);
      if (ctx === undefined) { ctx = c.getContext('2d', { alpha: false }); contextos.set(c, ctx); }
      if (!ctx) continue;
      ctx.drawImage(tela, qual === 'dir' ? tela.width - w : 0, qual === 'baixo' ? tela.height - h : 0, w, h, 0, 0, w, h);
      if (c.style.opacity !== '1') c.style.opacity = '1';
    }
    fonte = tela;
    limpaAntes = limpa;
  };
  return { guardar, aoDesenhar };
}
