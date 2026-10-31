/**
 * A Órbita (C4 da auditoria de 31/10; o João: "quero"): ao pôr uma música na
 * fila, a tocar a seguir ou nas Liked Songs, a capa vira disco e voa em arco
 * para onde a música foi, e no destino acende um anel. Fecha o A2: no iPhone o
 * "Add to queue" do menu de uma música não respondia nada.
 *
 * Aqui as decisões, sem imports (`scripts/test-orbita.ts`): os tempos, o arco e
 * as frases (só duas, onde havia cinco: "Added to queue", "Added to queue.",
 * "Added to the queue.", "<título> added to the queue." e "Added · <título>").
 * Quem desenha é o `desktop/Orbita.web.ts` (PC) e o `components/CamadaDaOrbita`
 * (iPhone, driver nativo; pousa POR CIMA do mini leitor, sem lhe mexer).
 */
export type DestinoDaOrbita = 'fila' | 'seguinte' | 'guardar';
export type Retangulo = { x: number; y: number; width: number; height: number };

/** O voo (ms): mais curto a tocar a seguir, que pousa ali ao lado. */
export const VOO_MS: Record<DestinoDaOrbita, number> = { fila: 460, seguinte: 380, guardar: 460 };
/** O anel que acende no destino: 0 → 0,6 → 0 de opacidade. */
export const ANEL_MS = 300;
/** Quanto o disco sobe a meio do voo, em fração da distância (e nunca menos de 40 pt). */
export const SUBIDA = 0.26;
export const SUBIDA_MINIMA = 40;
/** O disco que voa (pt), e o tamanho com que pousa (fração do destino). */
export const DISCO = 44;
export const POUSA_A = 0.62;

/** A frase, quando não há voo (menos movimento) ou para o VoiceOver. */
export function fraseDaOrbita(destino: DestinoDaOrbita, titulo: string): string {
  const base = destino === 'fila' ? 'Added to queue' : destino === 'seguinte' ? 'Playing next' : 'Added to Liked Songs';
  return titulo ? `${base} · ${titulo}` : base;
}

// ------------------------------------------------- o pedido do voo ----

export type PedidoDeOrbita = { destino: DestinoDaOrbita; capa?: string | null; titulo: string; de?: Retangulo };
let ouvinte: ((p: PedidoDeOrbita) => boolean) | null = null;

/** Quem desenha (a camada da raiz no iPhone) fica à escuta. Um de cada vez. */
export function ouvirOrbita(f: (p: PedidoDeOrbita) => boolean): () => void {
  ouvinte = f;
  return () => { if (ouvinte === f) ouvinte = null; };
}

/** Pede o voo. Devolve se alguém o desenhou (sem camada, ou sem destino à vista, `false`). */
export function pedirOrbita(p: PedidoDeOrbita): boolean {
  try { return ouvinte ? ouvinte(p) : false; } catch { return false; }
}

// ------------------------------------------- os destinos no iPhone ----

/** Os separadores com botão (o Social não tem): Home, Songs, Artists, Playlists. */
export const SEPARADORES_COM_BOTAO = 4;
export const INDICE_DAS_GOSTADAS = 1;
/** O mini leitor: a capa de 48 pt, a 12 + 8 pt da borda. */
export const CAPA_DO_MINI = { x: 20, lado: 48 };

/**
 * Onde pousa, no iPhone, a partir das medidas da base (`lib/doca.ts`), SEM
 * medir o mini leitor (é o leitor do iPhone, não se lhe mexe): na fila, por
 * cima do mini; a tocar a seguir, na capa dele; guardar, no separador Songs.
 * `null` quando o destino não está no ecrã (a base escondida, ou sem música).
 */
export function destinoNoIphone(destino: DestinoDaOrbita, m: {
  largura: number; altura: number; fundoSeguro: number; separadores: number; zonaDaMusica: number;
  modo: 'separadores' | 'semSeparadores' | 'escondida'; temMusica: boolean;
}): Retangulo | null {
  if (m.modo === 'escondida') return null;
  const topoDosSeparadores = m.altura - m.fundoSeguro - (m.modo === 'separadores' ? m.separadores : 0);
  if (destino === 'guardar') {
    if (m.modo !== 'separadores') return null;
    const largura = m.largura / SEPARADORES_COM_BOTAO;
    return { x: largura * INDICE_DAS_GOSTADAS + largura / 2 - 14, y: topoDosSeparadores + 8, width: 28, height: 28 };
  }
  if (!m.temMusica) return null;
  const topoDoMini = topoDosSeparadores - m.zonaDaMusica;
  if (destino === 'seguinte') return { x: CAPA_DO_MINI.x, y: topoDoMini + 8, width: CAPA_DO_MINI.lado, height: CAPA_DO_MINI.lado };
  return { x: 12, y: topoDoMini + 4, width: m.largura - 24, height: m.zonaDaMusica - 8 };
}

/** O centro de um retângulo. */
export function centro(r: Retangulo): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** Quantos troços tem o arco (13 pontos): a reta entre eles não se vê a 460 ms. */
export const TROCOS_DO_ARCO = 12;

/**
 * O voo de `de` para `para`, em deslocações a partir do centro de `de`: o x anda
 * a direito e o y é uma PARÁBOLA (um lançamento, com gravidade constante) que
 * passa pelo `pico` e acaba em `dy`. Com uma curva de mola a subir e outra a
 * cair, o disco chegava ao topo a 20 % do tempo e ficava lá parado (visto no
 * Chromium a 31/10). `arco` são os pontos (t de 0 a 1, y) para os fotogramas
 * do PC e para a interpolação nativa do iPhone. A escala acaba no tamanho do
 * destino.
 */
export function vooEmArco(de: Retangulo, para: Retangulo, destino: DestinoDaOrbita, topoDoEcra = 8) {
  const a = centro(de), b = centro(para);
  const dx = b.x - a.x, dy = b.y - a.y;
  const distancia = Math.hypot(dx, dy);
  // O ponto mais alto fica acima dos DOIS, para o arco nunca passar por baixo do
  // destino. A subir (a seta da fila está no topo da janela) passa-o pouco, e
  // nunca sai do ecrã (visto a 31/10: ia 60 px acima da janela).
  const subida = dy < 0 ? SUBIDA_MINIMA * 0.6 : Math.max(SUBIDA_MINIMA, distancia * SUBIDA);
  const pico = Math.min(Math.min(0, dy) - 4, Math.max(Math.min(0, dy) - subida, topoDoEcra - a.y));
  // y(t) = A t² + B t, com y(1) = dy e o mínimo em `pico`: A² + (4p - 2dy) A + dy² = 0, a raiz maior.
  const A = dy - 2 * pico + 2 * Math.sqrt(pico * (pico - dy));
  const B = dy - A;
  const arco = Array.from({ length: TROCOS_DO_ARCO + 1 }, (_, k) => {
    const t = k / TROCOS_DO_ARCO;
    return { t, y: k === TROCOS_DO_ARCO ? dy : A * t * t + B * t };
  });
  const lado = Math.max(8, Math.min(para.width, para.height));
  return { dx, dy, pico, arco, topoEm: (A - dy) / (2 * A), escalaFinal: (lado * POUSA_A) / DISCO, duracao: VOO_MS[destino] };
}
