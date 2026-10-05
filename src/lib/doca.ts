/**
 * A base de baixo do iPhone (3/10, variante A de `docs/base-e-barrinhas.html`):
 * o mini-player e os separadores são UMA peça de vidro. Aqui vivem as decisões,
 * sem imports: em que ecrãs aparece e onde fica cada parte. Quem desenha é o
 * `components/Doca.tsx` (o vidro e os separadores) e o `PlayerRoot` (a linha da
 * música, por cima do vidro).
 */

/** A altura da faixa da música, por cima dos separadores (o mini-player + 8). */
export const ZONA_DA_MUSICA = 72;
/**
 * A altura dos separadores (sem a área do indicador de casa) ATÉ SER MEDIDA:
 * 8 + ícone 24 + 3 + o nome (~13) + 6. Era um 49 escrito à mão em catorze
 * sítios, e a barra real tinha 54 -- e cresce com o tamanho do texto (até 1,2x
 * no nome). A medida a sério vem do `onLayout` da base (`state/doca.ts`).
 */
export const ALTURA_DOS_SEPARADORES = 54;

/**
 * - `separadores`: música (se houver) e separadores, como nas secções.
 * - `semSeparadores`: um ecrã da RAIZ por cima das secções: os separadores saem
 *   e a música desce para o fundo. Desde 5/10 nenhum o pede -- os detalhes
 *   (uma playlist vinda da Home, os Downloads) vivem nas pilhas dos separadores
 *   (auditoria N8) e ficam com a barra. Fica para um ecrã novo na raiz.
 * - `escondida`: ecrãs onde o João não quer o mini-player.
 */
export type ModoDaDoca = 'separadores' | 'semSeparadores' | 'escondida';

/**
 * Onde a base sai toda. O chat é uma página da pilha; editar perfil continua
 * numa janela que já tapa a base.
 */
export const ECRAS_SEM_BASE: ReadonlySet<string> = new Set(['Settings', 'LibraryCheck', 'ImportYouTube', 'Conversa']);

type EstadoDeNavegacao = { index?: number; routes: readonly { name: string; state?: EstadoDeNavegacao }[] };

/**
 * As folhas nativas (3/10): ficam POR CIMA de um ecrã, que continua a ser o que
 * manda na base -- a fila aberta sobre as secções não tira os separadores.
 */
export const FOLHAS: ReadonlySet<string> = new Set(['Fila', 'Folha']);

/** Os nomes das rotas em foco, da raiz para dentro (uma folha conta o ecrã de trás). */
export function rotasEmFoco(estado: EstadoDeNavegacao | undefined): string[] {
  const nomes: string[] = [];
  let atual = estado;
  while (atual && atual.routes.length) {
    let i = atual.index ?? atual.routes.length - 1;
    while (i > 0 && FOLHAS.has(atual.routes[i]?.name ?? '')) i--;
    const rota = atual.routes[i];
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
export function posicoesDaDoca(
  modo: ModoDaDoca, temMusica: boolean, fundoSeguro: number, separadores = ALTURA_DOS_SEPARADORES,
) {
  const fora = ZONA_DA_MUSICA + separadores + fundoSeguro + 24;
  const icones = modo === 'separadores' ? 0 : separadores + fundoSeguro + 24;
  const musica = modo === 'separadores' ? 0 : modo === 'semSeparadores' ? separadores : fora;
  let vidro: number;
  if (modo === 'escondida') vidro = fora;
  else if (modo === 'separadores') vidro = temMusica ? 0 : ZONA_DA_MUSICA;
  else vidro = temMusica ? separadores : fora;
  return { vidro, musica, icones };
}

/** Uma medida nova só conta se mudar meio ponto: o `onLayout` repete-se com décimas. */
export function medidaNova(antes: number, agora: number): number | null {
  if (!(agora > 0) || Math.abs(agora - antes) < 0.5) return null;
  return Math.round(agora * 2) / 2;
}
