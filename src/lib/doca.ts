/**
 * A base de baixo do iPhone (3/10, variante A de `docs/base-e-barrinhas.html`):
 * o mini-player e os separadores são UMA peça de vidro. Aqui vivem as decisões,
 * sem imports: em que ecrãs aparece e onde fica cada parte. Quem desenha é o
 * `components/Doca.tsx` (o vidro e os separadores) e o `PlayerRoot` (a linha da
 * música, por cima do vidro).
 */

/** A altura da faixa da música, por cima dos separadores (o mini-player + 8). */
export const ZONA_DA_MUSICA = 72;
/** A altura dos separadores, sem a área do indicador de casa. */
export const ALTURA_DOS_SEPARADORES = 49;

/**
 * - `separadores`: música (se houver) e separadores, como nas secções.
 * - `semSeparadores`: um ecrã aberto por cima das secções (uma playlist vinda da
 *   Pesquisa, os Downloads): os separadores saem e a música desce para o fundo.
 * - `escondida`: ecrãs onde o João não quer o mini-player.
 */
export type ModoDaDoca = 'separadores' | 'semSeparadores' | 'escondida';

/**
 * Onde a base sai toda (decisão do João, 3/10). O chat e o editar perfil são
 * janelas por cima de tudo e já a tapam.
 */
export const ECRAS_SEM_BASE: ReadonlySet<string> = new Set(['Settings', 'LibraryCheck', 'ImportYouTube']);

type EstadoDeNavegacao = { index?: number; routes: readonly { name: string; state?: EstadoDeNavegacao }[] };

/** Os nomes das rotas em foco, da raiz para dentro. */
export function rotasEmFoco(estado: EstadoDeNavegacao | undefined): string[] {
  const nomes: string[] = [];
  let atual = estado;
  while (atual && atual.routes.length) {
    const rota = atual.routes[atual.index ?? atual.routes.length - 1];
    if (!rota) break;
    nomes.push(rota.name);
    atual = rota.state;
  }
  return nomes;
}

export function modoDaDoca(rotas: readonly string[]): ModoDaDoca {
  if (rotas.some((r) => ECRAS_SEM_BASE.has(r))) return 'escondida';
  // Sem navegação lida ainda, as secções (é onde a app abre).
  if (!rotas.length || rotas[0] === 'Tabs') return 'separadores';
  return 'semSeparadores';
}

/** `#rrggbb` (ou `#rgb`) com transparência; outra coisa volta como veio. */
export function comAlfa(cor: string, alfa: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(cor.trim());
  if (!m) return cor;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

/**
 * Quanto cada parte desce (pt), a partir da base inteira nas secções.
 *
 * O vidro tem sempre a altura toda (música + separadores + indicador de casa)
 * e desce em vez de encolher: uma altura não anima no motor nativo, uma
 * deslocação sim. O que fica abaixo do ecrã não se vê.
 */
export function posicoesDaDoca(modo: ModoDaDoca, temMusica: boolean, fundoSeguro: number) {
  const fora = ZONA_DA_MUSICA + ALTURA_DOS_SEPARADORES + fundoSeguro + 24;
  const icones = modo === 'separadores' ? 0 : ALTURA_DOS_SEPARADORES + fundoSeguro + 24;
  const musica = modo === 'separadores' ? 0 : modo === 'semSeparadores' ? ALTURA_DOS_SEPARADORES : fora;
  let vidro: number;
  if (modo === 'escondida') vidro = fora;
  else if (modo === 'separadores') vidro = temMusica ? 0 : ZONA_DA_MUSICA;
  else vidro = temMusica ? ALTURA_DOS_SEPARADORES : fora;
  return { vidro, musica, icones };
}
