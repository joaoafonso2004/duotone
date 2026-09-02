import { artistaDaFaixa, vizinhancaDe } from './catalogo';
import {
  aprenderComABiblioteca, aprenderVocabulario, chaveDeArtista,
  ladosPorConfirmar, registarNomeDoCatalogo, type FaixaParaAprender,
} from '../lib/artistName';

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
