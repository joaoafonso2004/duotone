/**
 * Entrar pelo quadrado (24/11, a opção A de docs/entrar-e-qr-maquete.html; o João:
 * "quero que expanda o quadrado da playlist ou da folder para o ecrã, como se desse
 * a impressão de que estamos a entrar mesmo").
 *
 * Tocar numa playlist, numa pasta, numa mistura ou num artista: a cor da página
 * cresce a partir do quadrado até tapar o ecrã, e a capa voa do cartão para o sítio
 * dela no topo da página. A página abre por baixo SEM animação nativa, no instante
 * em que a cor já tapa tudo, e acende assim que existe, com a capa ainda a voar por
 * cima (26/11: esperava que a capa pousasse, e via-se a capa sozinha no preto e
 * depois a página a acender, como um "refresh"). Voltar pelo botão faz o
 * caminho ao contrário, até ao quadrado de onde saiu. Puxar para a direita em
 * qualquer ponto encolhe a página com o dedo até ao cartão (26/11, item 7 do plano,
 * `VOLTA`): a página de trás volta à janela por um pop interativo da pilha nativa
 * (`modules/duotone-volta`), porque a pilha tira-a depois de empurrar a nova.
 *
 * Aqui as contas e o pedido, sem imports de runtime (`scripts/test-voo-do-quadrado.ts`).
 * Quem desenha é a `components/CamadaDoQuadrado.tsx`; a página que abre é embrulhada
 * pela `components/PaginaDoQuadrado.tsx`, e a capa dela marca-se com `AlvoDoVoo`.
 */

export type Retangulo = { x: number; y: number; width: number; height: number };
export type FormaDoQuadrado = 'quadrado' | 'circulo';

/** A capa que voa: as mesmas imagens do cartão (uma, ou o mosaico de quatro). */
export type CapaDoVoo = { capas: readonly string[]; forma: FormaDoQuadrado };

/** A mola da entrada da app (`ENTRADA`, lib/movimento.ts), repetida para as contas. */
export const MOLA_DO_VOO = { stiffness: 190, damping: 22, mass: 1 } as const;
/** O véu por cima da página de trás, no máximo. */
export const VEU_MAXIMO = 0.55;
/** A cor a mais do que o ecrã, para os cantos redondos do quadrado ficarem fora dele. */
export const FOLGA_DA_COR = 1.12;
/** A troca: o fundo da camada apaga-se por cima da página (e, ao pousar, a capa sobre a dela). */
export const TROCA_MS = 180;
/**
 * A cor acaba de crescer a esta altura da mola, e não no fim (26/11, o João: "este
 * delay chato e a piscada"). Tapa o ecrã ~90 ms mais cedo, e a página abre por
 * baixo mais cedo; a capa continua a voar com a mola inteira.
 */
export const COR_ATE = 0.7;
/** Ao voltar: a cor tapa a página antes de ela sair (130 até 25/11: a espera antes de encolher sentia-se). */
export const TAPAR_MS = 90;
/** Se a página não disser nada (rebentou, ou demorou), aparece na mesma ao fim disto. */
export const ESPERA_MAXIMA_MS = 1200;

/**
 * A posição da mola de 0 a 1 ao longo do tempo (s), sem velocidade inicial: as
 * mesmas contas do Animated.spring (stiffness/damping/mass), por passos de 1 ms.
 */
export function curvaDaMola(t: number, mola: { stiffness: number; damping: number; mass: number } = MOLA_DO_VOO): number {
  let x = 0, v = 0;
  const dt = 0.001;
  for (let s = 0; s < t; s += dt) {
    const a = (-mola.stiffness * (x - 1) - mola.damping * v) / mola.mass;
    v += a * dt;
    x += v * dt;
  }
  return x;
}

/** Quanto tempo (ms) a mola leva a assentar (a 0,5 % do fim, e parada). */
export function duracaoDaMola(mola = MOLA_DO_VOO): number {
  let x = 0, v = 0, t = 0, quieta = 0;
  const dt = 0.001;
  while (t < 3) {
    const a = (-mola.stiffness * (x - 1) - mola.damping * v) / mola.mass;
    v += a * dt; x += v * dt; t += dt;
    if (Math.abs(x - 1) < 0.005 && Math.abs(v) < 0.05) { if (++quieta > 20) break; } else quieta = 0;
  }
  return Math.round(t * 1000);
}

/** O centro de um retângulo. */
const centro = (r: Retangulo) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/**
 * A cor da página: um quadrado (ou círculo) do tamanho do cartão, que vai do sítio
 * dele para o centro do ecrã e cresce até o tapar todo, com folga. Só `transform`,
 * escala uniforme: os cantos redondos crescem com ele e ficam fora do ecrã.
 */
export function vooDaCor(de: Retangulo, ecra: { width: number; height: number }, forma: FormaDoQuadrado) {
  const lado = Math.max(1, de.width);
  const precisa = forma === 'circulo' ? Math.hypot(ecra.width, ecra.height) : Math.max(ecra.width, ecra.height);
  const c = centro(de);
  return {
    dx: ecra.width / 2 - c.x,
    dy: ecra.height / 2 - c.y,
    escala: (precisa / lado) * FOLGA_DA_COR,
  };
}

/** A capa: de um retângulo para o outro (centro a centro, escala pela largura). */
/**
 * O círculo de um artista que vira a foto larga do topo da página (26/11, o João:
 * "abre um círculo e depois dá snap para a página do artista"). Voava um círculo
 * do tamanho da largura do ecrã e, ao pousar, a página trocava-o pela foto
 * retangular. Agora voa um quadrado do lado da foto (o maior lado do alvo), já no
 * sítio dela, com a imagem a cobrir: começa encolhido no cartão com os cantos a
 * metade do lado (um círculo), e os cantos vão a 0 enquanto cresce. Pousa como a
 * foto da página: o mesmo centro e o mesmo recorte (a cobrir, e o ecrã corta os
 * lados que sobram). Tudo por `transform` e `borderRadius`, no driver nativo.
 */
export function vooDoCirculoParaLarga(de: Retangulo, alvo: Retangulo) {
  const lado = Math.max(alvo.width, alvo.height);
  const a = centro(de), b = centro(alvo);
  return {
    caixa: { x: b.x - lado / 2, y: b.y - lado / 2, width: lado, height: lado },
    dx: a.x - b.x,
    dy: a.y - b.y,
    escala: de.width / Math.max(1, lado),
    raio: lado / 2,
  };
}

export function vooDaCapa(de: Retangulo, ate: Retangulo) {
  const a = centro(de), b = centro(ate);
  return { dx: b.x - a.x, dy: b.y - a.y, escala: ate.width / Math.max(1, de.width) };
}

/**
 * A cor tapa o ecrã todo quando o quadrado, já deslocado e crescido, contém os
 * quatro cantos. Com um círculo, quando os quatro cantos ficam dentro dele.
 * `p` é a posição da mola (0 a 1). Os cantos redondos do quadrado contam: o canto
 * do ecrã tem de estar dentro do quadrado menos o arredondado.
 */
export function corTapa(p: number, de: Retangulo, ecra: { width: number; height: number }, forma: FormaDoQuadrado, raio: number): boolean {
  const v = vooDaCor(de, ecra, forma);
  const s = 1 + (v.escala - 1) * p;
  const c = centro(de);
  const cx = c.x + v.dx * p, cy = c.y + v.dy * p;
  const cantos = [[0, 0], [ecra.width, 0], [0, ecra.height], [ecra.width, ecra.height]];
  if (forma === 'circulo') {
    const r = (de.width / 2) * s;
    return cantos.every(([x, y]) => Math.hypot(x - cx, y - cy) <= r);
  }
  const meio = (de.width / 2) * s - raio * s * (1 - Math.SQRT1_2);
  return cantos.every(([x, y]) => Math.abs(x - cx) <= meio && Math.abs(y - cy) <= meio);
}

/**
 * Quando (ms) a cor já tapa tudo: é aí que a página nova abre por baixo, sem
 * animação. Antes disso via-se a de trás desaparecer pelas frestas.
 */
export function momentoDeAbrir(de: Retangulo, ecra: { width: number; height: number }, forma: FormaDoQuadrado, raio: number, mola = MOLA_DO_VOO): number {
  let x = 0, v = 0;
  const dt = 0.001;
  for (let t = 0; t < 3; t += dt) {
    const a = (-mola.stiffness * (x - 1) - mola.damping * v) / mola.mass;
    v += a * dt; x += v * dt;
    if (corTapa(Math.min(1, x / COR_ATE), de, ecra, forma, raio)) return Math.round((t + dt) * 1000);
  }
  return duracaoDaMola(mola);
}

/**
 * Onde a capa pousa numa página que não tem capa no topo (uma pasta, uma mistura):
 * no título, pequena, e apaga-se a chegar (`apagaAoPousar`).
 */
export function alvoSemCapa(ecra: { width: number }, topo: number): Retangulo {
  return { x: 20, y: topo + 52, width: 40, height: 40 };
}

// ------------------------------------------------------- o pedido ----

export type PedidoDeVoo =
  | { tipo: 'entrar'; id: string; de: Retangulo; raio: number; capa: CapaDoVoo | null; navegar: () => void }
  | { tipo: 'voltar'; id: string; sair: () => void };

let ouvinte: ((p: PedidoDeVoo) => boolean) | null = null;

/** Quem desenha (a camada da raiz no iPhone) fica à escuta. Um de cada vez. */
export function ouvirVoos(f: (p: PedidoDeVoo) => boolean): () => void {
  ouvinte = f;
  return () => { if (ouvinte === f) ouvinte = null; };
}

/** Pede um voo. `false` quando não há quem o desenhe (então navega-se como sempre). */
export function pedirVoo(p: PedidoDeVoo): boolean {
  return ouvinte ? ouvinte(p) : false;
}

let proximo = 0;
export const novoIdDeVoo = (): string => `voo-${Date.now().toString(36)}-${(proximo++).toString(36)}`;

/**
 * A cascata quando a capa pousa (25/11, item 3 do plano, `docs/premium-ios-maquete.html#cascata`):
 * as primeiras linhas sobem e acendem uma a uma. UMA animação de 0 a 1 por página
 * (linear, no driver nativo), e cada linha lê a sua janela dela, já com a curva.
 */
export const CASCATA = {
  /** Só as que se veem ao abrir. */
  linhas: 10,
  /** Quanto sobem, em pt. */
  desvio: 14,
  duracaoMs: 760,
  /** Onde começa cada linha, em fração do total (~30 ms entre elas). */
  passo: 0.04,
  /** Quanto dura cada linha, em fração do total (~460 ms). */
  janela: 0.6,
} as const;

/** A janela de uma linha, amostrada com uma saída suave (o `cubic-bezier(.2,.9,.25,1)` da maquete). */
export function entradaDaLinha(indice: number): { inputRange: number[]; opacidade: number[]; desvio: number[] } {
  const inicio = Math.min(indice, CASCATA.linhas - 1) * CASCATA.passo;
  const inputRange: number[] = [], opacidade: number[] = [], desvio: number[] = [];
  const PONTOS = 6;
  for (let k = 0; k <= PONTOS; k++) {
    const t = k / PONTOS;
    const e = 1 - Math.pow(1 - t, 3);
    inputRange.push(+(inicio + t * CASCATA.janela).toFixed(4));
    opacidade.push(+e.toFixed(4));
    desvio.push(+(CASCATA.desvio * (1 - e)).toFixed(3));
  }
  return { inputRange, opacidade, desvio };
}

// ------------------------------------------- voltar a deslizar (item 7) ----

/**
 * Voltar a deslizar em qualquer ponto, a encolher para o cartão (26/11, item 7 do
 * plano, `docs/maquetes-da-lista-2026-11-25.html#m7`). Os números são os da maquete.
 */
export const VOLTA = {
  /** Quanto o dedo anda para a direita até o gesto pegar (pt). */
  pegaEm: 12,
  /** Na vertical, falha (a lista rola). */
  falhaNaVertical: 10,
  /** Largar depois desta fração da largura acaba de encolher e volta; antes, a página volta a abrir. */
  limite: 0.22,
  /** Quanto da velocidade (pt/s) conta para o caminho, num gesto rápido (até 100 pt). */
  pesoDaVelocidade: 0.2,
  /** O encolher enquanto o dedo arrasta: `p = dx / largura × ganho`, até `maximo`. */
  ganho: 0.95,
  maximo: 0.55,
  /** A página segue o dedo a esta fração. */
  segue: 0.25,
  /** O raio do recorte no fim (o do cartão). No começo é o dos cantos do ecrã. */
  raioDoCartao: 10,
  /** O conteúdo apaga-se a esta velocidade (`1 - p × apagar`). */
  apagar: 1.7,
  /** A cor da página apaga-se no fim, para o cartão de trás aparecer por ela. */
  corApagaDesde: 0.85,
  acabarMs: 380,
  reabrirMs: 320,
} as const;

/** Largar: `true` acaba de encolher e volta; `false` a página volta a abrir. */
export function decidirVolta(dx: number, velocidade: number, largura: number): boolean {
  const extra = Math.max(-100, Math.min(100, velocidade * VOLTA.pesoDaVelocidade));
  return dx + extra > largura * VOLTA.limite;
}

/** O encolher (`p`, 0 a 1) que o dedo dá enquanto arrasta. */
export function encolherDoDedo(dx: number, largura: number): number {
  return Math.max(0, Math.min(VOLTA.maximo, (dx / Math.max(1, largura)) * VOLTA.ganho));
}

/**
 * A capa ao voltar a deslizar (27/11), em coordenadas da página. O João, com um
 * vídeo: "quando saio da playlist, a imagem do carro fica gigante". A capa era um
 * quadrado a cobrir o recorte inteiro (da altura do ecrã) a encolher até ao cartão.
 * Agora sai do sítio onde está na página, com o tamanho que lá tem, e encolhe até
 * ao cartão, como a da seta (`CamadaDoQuadrado`): nunca é maior do que era.
 *
 * Uma caixa quadrada do lado maior da capa da página (a foto de um artista é mais
 * alta do que larga: o recorte corta os lados, como o ecrã), no centro dela, que
 * anda até ao centro do cartão e escala até ao lado dele. `entrada`: `null` quando
 * a capa se levanta da página (a dela esconde-se, e esta já lá está por cima); a
 * de um artista acende depressa por cima da foto (a capa da página leva o nome e
 * os botões, que se apagariam de uma vez); fora da vista (a lista rolou), aparece
 * ao centro, do tamanho da de uma playlist, e acende como antes.
 */
export function capaDaVolta(
  naPagina: Retangulo | null,
  cartao: Retangulo,
  pagina: { width: number; height: number },
  forma: FormaDoQuadrado,
): { caixa: Retangulo; dx: number; dy: number; escala: number; entrada: [number, number] | null } {
  const vista = !!naPagina && naPagina.width > 0 && naPagina.height > 0
    && naPagina.y + naPagina.height > 0 && naPagina.y < pagina.height;
  const lado = vista ? Math.max(naPagina!.width, naPagina!.height) : Math.min(240, Math.round(pagina.width * 0.52));
  const cx = vista ? naPagina!.x + naPagina!.width / 2 : pagina.width / 2;
  const cy = vista ? naPagina!.y + naPagina!.height / 2 : pagina.height / 2;
  return {
    caixa: { x: cx - lado / 2, y: cy - lado / 2, width: lado, height: lado },
    dx: cartao.x + cartao.width / 2 - cx,
    dy: cartao.y + cartao.height / 2 - cy,
    escala: cartao.width / Math.max(1, lado),
    entrada: !vista ? [0.12, 0.5] : forma === 'circulo' ? [0, 0.25] : null,
  };
}

/**
 * O recorte da página em `p` (0 = o ecrã inteiro, 1 = o cartão), em coordenadas da
 * página. Na maquete é um `clip-path: inset(...)`; aqui uma caixa com `overflow:
 * hidden` que se desloca e escala (`tx`, `ty`, `sx`, `sy`, à volta do centro) e
 * leva dentro o conteúdo com a escala ao contrário, para não se deformar. Os cantos
 * escalam com a caixa: o `raio` (dela) dá o canto visto (`raioVisto`) na média
 * das duas escalas.
 */
export function recorteDaVolta(
  p: number,
  pagina: { width: number; height: number },
  cartao: Retangulo,
  raioDoEcra: number,
) {
  const W = Math.max(1, pagina.width), H = Math.max(1, pagina.height);
  const left = cartao.x * p, top = cartao.y * p;
  const width = W - p * (W - cartao.width), height = H - p * (H - cartao.height);
  const sx = width / W, sy = height / H;
  const raioVisto = raioDoEcra + (VOLTA.raioDoCartao - raioDoEcra) * p;
  return {
    tx: left + width / 2 - W / 2,
    ty: top + height / 2 - H / 2,
    sx, sy,
    raioVisto,
    raio: raioVisto / Math.sqrt(sx * sy),
    conteudo: Math.max(0, 1 - p * VOLTA.apagar),
    veu: VEU_MAXIMO * (1 - p),
  };
}

/**
 * O que o driver nativo precisa para desenhar o recorte: tudo em função de `p`. O
 * que é linear em `p` vai em dois pontos; o raio, que não é, em amostras.
 */
export function amostrasDaVolta(
  pagina: { width: number; height: number },
  cartao: Retangulo,
  raioDoEcra: number,
  pontos = 8,
) {
  const fim = recorteDaVolta(1, pagina, cartao, raioDoEcra);
  const p: number[] = [], raio: number[] = [];
  for (let k = 0; k <= pontos; k++) {
    const t = k / pontos;
    p.push(+t.toFixed(4));
    raio.push(+recorteDaVolta(t, pagina, cartao, raioDoEcra).raio.toFixed(3));
  }
  return { tx: fim.tx, ty: fim.ty, sx: fim.sx, sy: fim.sy, p, raio };
}

