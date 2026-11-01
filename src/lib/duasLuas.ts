/**
 * As Duas luas (C9 da auditoria de 31/10, `docs/elevacao-maquete.html`, fecha a A10):
 * a passagem a ver-se. Só existe durante uma passagem, a do AutoMix ou a do crossfade;
 * fora disso a capa é a de sempre. A da música que entra nasce por trás da que sai,
 * como o segundo crescente do símbolo, e a sobreposição é linear, como o volume.
 *
 * Com o crossfade fica só isto: não há batida nem graves. Com o AutoMix há o resto,
 * porque a app conhece a música: um anel em cada batida (só na passagem na batida,
 * onde a grelha é medida), os discos a trocar de profundidade na troca dos graves, e
 * por baixo, durante 3 s, o andamento e a tonalidade.
 *
 * Aqui só os números e as decisões. Quem desenha: `components/DuasLuas.tsx` no iPhone
 * e `desktop/DuasLuas.web.tsx` no PC. Sem rede. `scripts/test-duas-luas.ts`.
 */
import { estadoDaPassagem, type PlanoDoAutomix } from './automix';

export const LUAS = {
  /** Até onde cada uma se afasta do centro, em lados da capa. */
  deslocacao: 0.28,
  /** O tamanho de quem está atrás. */
  escala: 0.82,
  /** Quem está atrás escurece, para a da frente mandar. */
  sombra: 0.55,
  /** A que entra nasce nesta parte da passagem. */
  nascer: 0.08,
  /** No fim, a velha sai para a esquerda. */
  saida: { deslocacao: 0.7, escala: 0.7, ms: 300 },
  /** Um corte dura meio segundo: abaixo disto via-se um salto, e não duas luas. */
  minimoMs: 1200,
  /** O andamento e a tonalidade ficam este tempo à vista. */
  legendaMs: 3000,
  /** A da frente cruza com a capa de sempre ao começar. */
  cruzarMs: 120,
  /** Quanto se espera que a capa de sempre troque (o cruzamento dela é de 260 ms). */
  entregaMs: 300,
  /** E a da frente apaga-se por cima dela. */
  apagarMs: 200,
  /** Se a fila não avançar até aqui, as luas saem na mesma. */
  esperaPelaFilaMs: 2500,
  /** O anel da batida sobe neste tempo, e o resto da batida é a descer. */
  subirDoAnelMs: 80,
} as const;

export type AnelDaPassagem = { batidaMs: number; batidas: number };

/** O que só o AutoMix sabe. Num crossfade não há nada disto. */
export type AutomixAVista = {
  legenda: string | null;
  anel: AnelDaPassagem | null;
  /** Em que parte da passagem as luas trocam de profundidade, de 0 a 1. */
  trocaEm: number;
};

/** Um crossfade troca a meio: não há graves que digam onde. */
export const TROCA_DO_CROSSFADE = 0.5;

export function duracaoDasLuas(duracaoMs: number): number {
  return Math.max(duracaoMs, LUAS.minimoMs);
}

/**
 * Onde cada lua está no instante `t` da passagem, de 0 a 1: a deslocação em lados da
 * capa, a escala, quanto escurece e a opacidade. As duas plataformas desenham isto.
 */
export function luaNoInstante(qual: 'sai' | 'entra', t: number) {
  const p = Math.min(1, Math.max(0, t));
  if (qual === 'sai') {
    return { x: -LUAS.deslocacao * p, escala: 1 - (1 - LUAS.escala) * p, sombra: LUAS.sombra * p, opacidade: 1 };
  }
  return {
    x: LUAS.deslocacao * (1 - p),
    escala: LUAS.escala + (1 - LUAS.escala) * p,
    sombra: LUAS.sombra * (1 - p),
    opacidade: Math.min(1, p / LUAS.nascer),
  };
}

/** `124 → 128 BPM · 8A → 9A`, só com o que se sabe. No suave a batida não é clara. */
export function legendaDaPassagem(p: Pick<PlanoDoAutomix, 'tipo' | 'bpmSai' | 'bpmEntra' | 'tomSai' | 'tomEntra'>): string | null {
  const partes: string[] = [];
  if (p.tipo !== 'suave' && p.bpmSai && p.bpmEntra) partes.push(`${Math.round(p.bpmSai)} → ${Math.round(p.bpmEntra)} BPM`);
  if (p.tomSai && p.tomEntra) partes.push(`${p.tomSai} → ${p.tomEntra}`);
  return partes.length ? partes.join(' · ') : null;
}

/**
 * O anel só na passagem na batida: é a única em que o início cai num tempo forte e a
 * grelha não deriva até ao fim. Nas outras uma das duas não tem batida a tocar, e um
 * tique fora da batida é pior do que nenhum.
 */
export function anelDaPassagem(p: Pick<PlanoDoAutomix, 'tipo' | 'bpmSai' | 'duracaoS'>): AnelDaPassagem | null {
  if (p.tipo !== 'batida' || !p.bpmSai) return null;
  const batidaMs = 60_000 / p.bpmSai;
  return { batidaMs, batidas: Math.max(1, Math.round((p.duracaoS * 1000) / batidaMs)) };
}

/**
 * Quando os graves trocam: o primeiro instante em que os da que entra deixam de estar
 * mais cortados do que os da que sai. Nunca colado às pontas: num corte os graves
 * trocam antes de começar, e a nova saltava logo para a frente de uma velha sem se ver.
 */
export function trocaDaPassagem(p: Pick<PlanoDoAutomix, 'curva' | 'duracaoS'>): number {
  const PASSOS = 48;
  for (let i = 0; i <= PASSOS; i++) {
    const e = estadoDaPassagem(p.curva, (p.duracaoS * i) / PASSOS);
    if (e.gravesEntra >= e.gravesSai) return Math.min(0.75, Math.max(0.25, i / PASSOS));
  }
  return TROCA_DO_CROSSFADE;
}

export function automixAVista(p: PlanoDoAutomix): AutomixAVista {
  return { legenda: legendaDaPassagem(p), anel: anelDaPassagem(p), trocaEm: trocaDaPassagem(p) };
}

/**
 * Uma passagem anunciada ainda se pode ver? Sem isto, abrir o leitor depois de ela
 * acabar (com ele fechado, ninguém a limpa) punha as luas de uma passagem antiga.
 */
export function passagemAindaVale(p: { comecaEm: number; duracaoMs: number }, agora: number): boolean {
  return agora < p.comecaEm + duracaoDasLuas(p.duracaoMs);
}
