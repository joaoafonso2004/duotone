/**
 * A janela de uma tabela de faixas do PC (`TrackTable`, 7/11).
 *
 * A tabela montava 60 linhas e mais 120 sempre que o fim se aproximava, e nunca
 * desmontava nenhuma: numa playlist de 3000, à volta da 1500 havia 1500 linhas
 * vivas (32 mil nós no DOM, 274 MB de memória JS), cada lote novo redesenhava a
 * tabela inteira (o pior, 319 ms) e mudar de música lá em baixo congelava 850 ms
 * -- o "fica tudo lento e a encravar" do João.
 *
 * Agora só existem as linhas à vista e uma margem de cada lado; o resto é
 * espaço com a altura certa, para a barra de rolar e o sítio do scroll serem os
 * de sempre. A janela anda aos DEGRAUS (de `DEGRAU` em `DEGRAU` linhas): rolar
 * dentro de um degrau não redesenha nada.
 *
 * Tudo em píxeis a contar do topo da primeira linha. Uma `divisoria` (as tuas e
 * as outras de um artista) é uma linha de outra altura antes da faixa `antesDe`.
 */

/** Até aqui monta-se tudo, como antes (é o que a tabela montava ao abrir). */
export const SEM_JANELA_ATE = 60;
/** Linhas montadas acima e abaixo do que se vê: ~600 px de cada lado. */
export const MARGEM_DE_LINHAS = 12;
/** A janela só muda de tantas em tantas linhas. */
export const DEGRAU = 8;
/** Antes de haver medidas: uma janela que encha um ecrã alto. */
export const ALTURA_VISIVEL_ESTIMADA = 1200;

export type DivisoriaDaJanela = { antesDe: number; altura: number } | null;
export type Janela = { inicio: number; fim: number };

/** A divisória só existe entre duas linhas (é assim que a tabela a desenha). */
function divisoriaAtiva(d: DivisoriaDaJanela | undefined, total: number): d is { antesDe: number; altura: number } {
  return !!d && d.antesDe > 0 && d.antesDe < total;
}

/** Onde começa a linha `i` (ou, com `i = total`, onde acaba a última). */
export function topoDaLinha(i: number, alturaDaLinha: number, total: number, divisoria?: DivisoriaDaJanela): number {
  const extra = divisoriaAtiva(divisoria, total) && i >= divisoria.antesDe ? divisoria.altura : 0;
  return i * alturaDaLinha + extra;
}

/** A altura de todas as linhas juntas (com a divisória). */
export function alturaDasLinhas(total: number, alturaDaLinha: number, divisoria?: DivisoriaDaJanela): number {
  return topoDaLinha(total, alturaDaLinha, total, divisoria);
}

/** A linha que está a `y` px do topo (presa entre 0 e `total`). */
export function linhaEm(y: number, alturaDaLinha: number, total: number, divisoria?: DivisoriaDaJanela): number {
  if (!(alturaDaLinha > 0) || y <= 0) return 0;
  let i: number;
  if (divisoriaAtiva(divisoria, total)) {
    const antes = divisoria.antesDe * alturaDaLinha;
    i = y < antes ? Math.floor(y / alturaDaLinha)
      : y < antes + divisoria.altura ? divisoria.antesDe
        : Math.floor((y - divisoria.altura) / alturaDaLinha);
  } else i = Math.floor(y / alturaDaLinha);
  return Math.min(total, Math.max(0, i));
}

/**
 * As linhas a montar. `topoVisivel` é quanto do topo das linhas já passou para
 * cima da janela de scroll (negativo se a tabela ainda está mais abaixo).
 */
export function janelaDaTabela({
  topoVisivel, alturaVisivel, alturaDaLinha, total, divisoria = null,
  margem = MARGEM_DE_LINHAS, degrau = DEGRAU,
}: {
  topoVisivel: number; alturaVisivel: number; alturaDaLinha: number; total: number;
  divisoria?: DivisoriaDaJanela; margem?: number; degrau?: number;
}): Janela {
  if (total <= SEM_JANELA_ATE) return { inicio: 0, fim: total };
  const primeira = linhaEm(topoVisivel, alturaDaLinha, total, divisoria);
  const ultima = linhaEm(topoVisivel + Math.max(0, alturaVisivel), alturaDaLinha, total, divisoria) + 1;
  const inicio = Math.max(0, Math.floor((primeira - margem) / degrau) * degrau);
  const fim = Math.min(total, Math.max(inicio + 1, Math.ceil((ultima + margem) / degrau) * degrau));
  return { inicio: Math.min(inicio, Math.max(0, total - 1)), fim };
}

/** A janela que já monta a linha `i` (o teclado e o atalho para a que toca). */
export function janelaComALinha(j: Janela, i: number, total: number, margem = MARGEM_DE_LINHAS, degrau = DEGRAU): Janela {
  if (i >= j.inicio && i < j.fim) return j;
  const inicio = Math.max(0, Math.floor((i - margem) / degrau) * degrau);
  return { inicio, fim: Math.min(total, Math.ceil((i + 1 + margem) / degrau) * degrau) };
}

/** O scroll que põe a linha à vista com o mínimo de movimento (o "nearest"), ou null se já está. */
export function scrollParaVer(
  { scrollTop, alturaVisivel, origem, topo, altura, tapadoEmCima = 0 }:
  { scrollTop: number; alturaVisivel: number; origem: number; topo: number; altura: number; tapadoEmCima?: number },
): number | null {
  const cima = origem + topo, baixo = cima + altura;
  if (cima < scrollTop + tapadoEmCima) return Math.max(0, cima - tapadoEmCima);
  if (baixo > scrollTop + alturaVisivel) return baixo - alturaVisivel;
  return null;
}

/** Iguais? (para não redesenhar a tabela por uma janela que não mudou). */
export const mesmaJanela = (a: Janela, b: Janela) => a.inicio === b.inicio && a.fim === b.fim;
