/**
 * O título que encolhe no lugar (3/10, variante B de
 * `docs/fluidez-avisos-titulo.html`, escolhida pelo João).
 *
 * O cabeçalho flutua por cima da lista, e a lista começa com um espaço da
 * altura dele: o conteúdo anda 1:1 com o dedo. Ao rolar, o título grande
 * encolhe para o tamanho do de uma barra do iOS e desliza para o centro dela;
 * o subtítulo desvanece; o que está por baixo do título (a pesquisa, os botões)
 * sobe a mesma distância, e fica colado à barra compacta.
 *
 * As contas vivem aqui, em números do ecrã, para se testarem em Node
 * (`scripts/test-titulo-que-encolhe.ts`); o `Screen` só as liga ao scroll.
 */

/** A barra compacta, por baixo da safe area. */
export const ALTURA_DA_BARRA = 44;
/** O tamanho do título na barra compacta (o de uma barra do iOS). */
export const TITULO_COMPACTO = 17;

export type MedidasDoCabecalho = {
  larguraDoEcra: number;
  topoSeguro: number;
  /** A linha do título: onde acaba em baixo (o que encolhe é até aqui). */
  fundoDaLinha: number;
  /** O título: onde está (no ecrã) e quanto mede. */
  titulo: { x: number; y: number; largura: number; altura: number; tamanho: number };
  /** O botão da direita e o de voltar, se existirem: o centro vertical deles. */
  centroDaDireita?: number;
  centroDoVoltar?: number;
};

export type GeometriaDoTitulo = {
  /** Quanto se rola até o cabeçalho ficar compacto. */
  distancia: number;
  /** O título no fim: escala (com a origem à esquerda) e deslocamento. */
  escala: number;
  dx: number;
  dy: number;
  /** Quanto descem (negativo: sobem) os botões até ao centro da barra. */
  dyDaDireita: number;
  dyDoVoltar: number;
};

export function geometriaDoTitulo(m: MedidasDoCabecalho): GeometriaDoTitulo {
  const centroDaBarra = m.topoSeguro + ALTURA_DA_BARRA / 2;
  // O que encolhe é a linha do título até ficar da altura da barra. Nunca
  // negativo: um cabeçalho já compacto não tem nada para encolher.
  const distancia = Math.max(0, Math.round(m.fundoDaLinha - (m.topoSeguro + ALTURA_DA_BARRA)));
  const escala = Math.min(1, TITULO_COMPACTO / m.titulo.tamanho);
  // A escala é à volta da ponta esquerda: no fim a ponta esquerda fica onde o
  // título encolhido fica centrado, e o centro vertical no da barra.
  const esquerdaNoFim = (m.larguraDoEcra - m.titulo.largura * escala) / 2;
  const dx = esquerdaNoFim - m.titulo.x;
  const dy = centroDaBarra - (m.titulo.y + m.titulo.altura / 2);
  return {
    distancia,
    escala,
    dx,
    dy,
    dyDaDireita: m.centroDaDireita === undefined ? -distancia : centroDaBarra - m.centroDaDireita,
    dyDoVoltar: m.centroDoVoltar === undefined ? -distancia : centroDaBarra - m.centroDoVoltar,
  };
}

/**
 * O fundo da barra (desfoque) aparece quando há conteúdo por baixo dela: logo
 * nos primeiros pontos de scroll. Parado no topo fica transparente, como hoje.
 */
export const FUNDO_APARECE_EM = 10;

/**
 * Onde a barra com o nome aparece por cima de uma página com capa (o perfil do
 * iPhone, 4/10): começa a acender quando o nome grande chega à borda de baixo
 * dela e fica opaca quando ele passou por baixo. Devolve um intervalo de
 * rolagem SEMPRE crescente -- o perfil tinha-o ao contrário, e o motor nativo
 * não o recusa: a barra ficava opaca no topo, por cima de metade da capa.
 */
export function faixaDaBarraDoNome(fimDoNome: number, alturaDaBarra: number, transicao = 30): [number, number] {
  const fim = Math.max(transicao, fimDoNome - alturaDaBarra);
  return [fim - transicao, fim];
}
