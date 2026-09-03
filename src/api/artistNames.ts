import { artistaDaFaixa, vizinhancaDe } from './catalogo';
import {
  aprenderComABiblioteca, aprenderVocabulario, chaveDeArtista,
  ladosPorConfirmar, registarNomeDoCatalogo, type FaixaParaAprender,
} from '../lib/artistName';

/**
 * O mesmo trabalho, mas sem prender a lista à espera da rede.
 *
 * **Porque é que isto existe.** O `getLibrary` e o `getLikedSongs` faziam
 * `await confirmarArtistas(...)` antes de devolverem uma única faixa. Só que
 * confirmar nomes vai ao catálogo -- três pedidos em paralelo, e a seguir um
 * ciclo SEQUENCIAL com mais dois pedidos por cada par ambíguo. Resultado: as
 * páginas Artists e Liked Songs ficavam com o ecrã vazio durante todo esse
 * tempo, para mostrar faixas que já estavam em memória desde o primeiro
 * pedido.
 *
 * A confirmação é um APERFEIÇOAMENTO do nome, não uma condição para o
 * mostrar. O que é local -- e é o que o `displayArtist` mais usa -- acontece
 * já, de graça; o que precisa de rede vai atrás e avisa quando aterrar.
 */
export function confirmarArtistasEmSegundoPlano(faixas: readonly FaixaParaAprender[]): void {
  // Barato e sem rede: o vocabulário que sai da própria biblioteca.
  aprenderComABiblioteca(faixas);
  void confirmarArtistas(faixas)
    .catch(() => { /* Sem rede fica o que se aprendeu localmente. */ })
    .then(avisarQueOsNomesMudaram);
}

/**
 * Diz às páginas que os nomes melhoraram, para voltarem a desenhar.
 *
 * Só na web: no iOS o `window` existe mas não tem `dispatchEvent`, e lá os
 * nomes acertam-se na navegação seguinte.
 */
function avisarQueOsNomesMudaram(): void {
  const alvo: any = typeof window !== 'undefined' ? window : null;
  if (alvo && typeof alvo.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    alvo.dispatchEvent(new CustomEvent('duotone:artistas-confirmados'));
  }
}

/** Aprende nomes antes de entregar a biblioteca aos ecrãs e às recomendações. */
export async function confirmarArtistas(faixas: readonly FaixaParaAprender[]): Promise<void> {
  const vocabulario = aprenderVocabulario(faixas);
  const nomes = new Map<string, string>();
  const pares = new Map<string, string[]>();
  const respostas = new Map<string, string | null>();
  for (const faixa of faixas) {
    const lados = ladosPorConfirmar(faixa, vocabulario);
    if (lados.length !== 2) continue;
    pares.set(lados.map(chaveDeArtista).join('|'), lados);
    for (const nome of lados) nomes.set(chaveDeArtista(nome), nome);
  }
  // Três trabalhadores limitam os pedidos de cache; o catálogo também regula a rede.
  const fila = [...nomes.values()];
  let indice = 0;
  await Promise.all(Array.from({ length: Math.min(3, fila.length) }, async () => {
    while (indice < fila.length) {
      const nome = fila[indice++];
      try {
        const resultado = await vizinhancaDe(nome);
        respostas.set(chaveDeArtista(nome), resultado?.artista.nome ?? null);
        registarNomeDoCatalogo(nome, resultado?.artista.nome ?? null);
      } catch {
        // Não aprender nada de uma falha temporária. A biblioteca continua disponível.
      }
    }
  }));
  for (const [esquerda, direita] of pares.values()) {
    if (respostas.get(chaveDeArtista(esquerda)) !== null || respostas.get(chaveDeArtista(direita)) !== null) continue;
    try {
      const [a, b] = await Promise.all([artistaDaFaixa(direita, esquerda), artistaDaFaixa(esquerda, direita)]);
      // Se ambas as orientações forem válidas, continua ambíguo.
      if (a && !b) registarNomeDoCatalogo(esquerda, a);
      if (b && !a) registarNomeDoCatalogo(direita, b);
    } catch { /* A próxima leitura pode voltar a tentar com rede. */ }
  }
  aprenderComABiblioteca(faixas);
}
