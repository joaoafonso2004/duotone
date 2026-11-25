/**
 * O modo limpo do PC: a janela em ecrã inteiro, a capa e a barra ao centro, e
 * mais nada. Pensado para o segundo monitor -- fica lá a tocar enquanto se
 * trabalha no outro, e não há nada a piscar a pedir atenção.
 *
 * Sem imports de runtime, de propósito (como o `lib/radio.ts`): as contas de
 * tamanho e de tempo ficam testáveis em Node puro
 * (`scripts/test-modo-limpo.ts`), e a parte que desenha vive em
 * `desktop/ModoLimpo.web.tsx`.
 */

/**
 * Quanto tempo sem mexer o rato até a interface se apagar e o cursor sumir.
 *
 * Dois segundos e meio: menos do que isto apaga-se a meio de se ir buscar o
 * botão, mais do que isto e o ecrã passa a maior parte do tempo com controlos
 * por cima da capa -- que é exatamente o que este modo veio evitar.
 */
export const INACTIVIDADE_MS = 2600;

/** Limites da capa. O mínimo é para uma janela pequena não ficar ridícula; o
 *  máximo é para um monitor grande não encher o ecrã com uma miniatura de
 *  YouTube esticada, que fica pastosa muito antes disso. */
export const CAPA_MINIMA = 180;
export const CAPA_MAXIMA = 720;

/**
 * Quanto se tira à altura da janela antes de medir a capa.
 *
 * Debaixo dela vivem o nome (58), a barra (16) e os controlos (60) -- 134 --,
 * e ainda o logo, que é absoluto no fundo e não entra na conta da coluna. Com
 * 210 o logo encostava aos controlos numa janela de 600 px de altura; 230 mais
 * o `paddingBottom` do ecrã dão-lhe o lugar dele.
 */
export const ALTURA_RESERVADA = 230;

/**
 * O lado da capa para uma janela destas.
 *
 * Sobra de propósito: o ecrã só é "limpo" se houver ar à volta. Num monitor
 * 16:9 é a altura que manda, num ultrawide é a largura.
 */
export function tamanhoDaCapa(largura: number, altura: number): number {
  const cabe = Math.min(largura * 0.62, altura - ALTURA_RESERVADA);
  return Math.round(Math.max(CAPA_MINIMA, Math.min(CAPA_MAXIMA, cabe)));
}

/** Já passou tempo sem mexer o rato? */
export function estaQuieto(ultimoMovimentoMs: number, agoraMs: number, atrasoMs = INACTIVIDADE_MS): boolean {
  return agoraMs - ultimoMovimentoMs >= atrasoMs;
}

/** A fração tocada, entre 0 e 1. Sem duração não há barra que valha: 0. */
export function progressoDaFaixa(posicaoMs: number, duracaoMs: number): number {
  if (!Number.isFinite(posicaoMs) || !Number.isFinite(duracaoMs) || duracaoMs <= 0) return 0;
  return Math.min(1, Math.max(0, posicaoMs / duracaoMs));
}

/** Onde se carregou na barra, entre 0 e 1. */
export function posicaoDoClique(clientX: number, esquerda: number, largura: number): number {
  if (!Number.isFinite(clientX) || !(largura > 0)) return 0;
  return Math.min(1, Math.max(0, (clientX - esquerda) / largura));
}

/**
 * A miniatura tem barras pretas?
 *
 * As do YouTube em 4:3 -- `default`, `hqdefault`, `sddefault` -- sao uma
 * moldura 4:3 com o video 16:9 la dentro, e sobram duas faixas pretas. Numa
 * capa quadrada isso ve-se logo. As de 16:9 (`mqdefault`, `maxresdefault`) nao
 * as tem, e as capas quadradas do catalogo tambem nao.
 */
export function capaComBarras(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\/(?:default|hqdefault|sddefault)\.(?:jpg|webp)(?:[?#]|$)/i.test(url);
}

/**
 * Onde por a imagem para as barras ficarem DE FORA de um quadrado de `lado`.
 *
 * A conta: o conteudo ocupa 270 das 360 linhas da miniatura, por isso a imagem
 * tem de ser desenhada a 4/3 da altura do quadrado para o conteudo ficar com o
 * lado todo -- e a largura acompanha (16/9 do lado). O resto sai pelos
 * cantos, e e por isso que quem a usa precisa de `overflow: hidden`.
 */
export function molduraSemBarras(lado: number): {
  largura: number; altura: number; esquerda: number; topo: number;
} {
  const altura = (lado * 4) / 3;
  const largura = (lado * 16) / 9;
  return { largura, altura, esquerda: (lado - largura) / 2, topo: (lado - altura) / 2 };
}

// ---------------------------------------------------------------------------
// A letra ao lado (25/11, a disposição A da `ecra-inteiro-maquete.html`)
// ---------------------------------------------------------------------------

/** A coluna da letra fica entre estes dois: mais estreita partia cada verso em três. */
export const LETRA_MINIMA = 380;
export const LETRA_MAXIMA = 760;
/** Abaixo disto a capa ao lado da letra fica pequena demais: vai sozinha ao centro. */
export const CAPA_MINIMA_AO_LADO = 260;
/**
 * Debaixo da capa, com o texto à escala dela: o nome (14 + 76), a barra (24) e os
 * controlos com o disco (62 + 18) -- os números do `ModoLimpo.web.tsx`. Uma reserva
 * fixa deixava a coluna encostada em cima numa janela pequena (25/11).
 */
export function reservaAoLado(escala: number): number {
  return Math.round(56 + 138 * escala);
}
/** O texto cresce com a capa: 1 numa capa de 640, como na maquete. */
export function escalaDoModoLimpo(lado: number): number {
  return Math.max(0.7, Math.min(1.15, lado / 640));
}
/** O logo, absoluto no fundo. */
const RODAPE = 60;
/** O ar mínimo por cima da coluna. */
const TOPO_MINIMO = 28;

export type DisposicaoDoModoLimpo = {
  /** Há lugar para a letra ao lado da capa. Sem letra a capa vai ao centro, do mesmo tamanho. */
  aoLado: boolean;
  lado: number;
  /** O texto cresce com a capa: 1 numa capa de 640, como na maquete. */
  escala: number;
  /** Onde fica a coluna da capa com a letra ao lado, e onde fica sozinha. */
  colunaX: number;
  centroX: number;
  topo: number;
  letra: { x: number; topo: number; largura: number; altura: number };
};

/**
 * A capa à esquerda e a letra à direita, as duas ao centro do ecrã. A capa tem o
 * MESMO lado com e sem letra: uma música sem letra só a desliza para o centro, e
 * a seguinte com letra volta a pô-la ao lado, sem ela mudar de tamanho a meio da
 * troca de música.
 */
export function disposicaoDoModoLimpo(largura: number, altura: number): DisposicaoDoModoLimpo {
  const margem = Math.max(48, Math.round(largura * 0.07));
  const entre = Math.max(48, Math.round(largura * 0.05));
  const util = largura - 2 * margem - entre;
  // A reserva depende do lado (o texto cresce com ele): umas voltas chegam, porque
  // cada uma só mexe um quinto da anterior.
  let porAltura = altura - RODAPE - 2 * TOPO_MINIMO - reservaAoLado(1);
  for (let i = 0; i < 4; i++) porAltura = altura - RODAPE - 2 * TOPO_MINIMO - reservaAoLado(escalaDoModoLimpo(porAltura));
  const ladoAoLado = Math.round(Math.min(CAPA_MAXIMA, porAltura, util - LETRA_MINIMA, util * 0.5));
  const aoLado = ladoAoLado >= CAPA_MINIMA_AO_LADO;
  const lado = aoLado ? ladoAoLado : tamanhoDaCapa(largura, altura - 40);
  const larguraDaLetra = aoLado ? Math.min(LETRA_MAXIMA, util - lado) : 0;
  const total = lado + entre + larguraDaLetra;
  const colunaX = aoLado ? Math.round((largura - total) / 2) : Math.round((largura - lado) / 2);
  const escala = escalaDoModoLimpo(lado);
  const reserva = reservaAoLado(escala);
  const topo = Math.max(TOPO_MINIMO, Math.round((altura - RODAPE - lado - reserva) / 2));
  return {
    aoLado,
    lado,
    escala,
    colunaX,
    centroX: Math.round((largura - lado) / 2),
    topo,
    letra: { x: colunaX + lado + entre, topo: topo - 16, largura: larguraDaLetra, altura: lado + 32 },
  };
}
