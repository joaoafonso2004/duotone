import { artistaDaFaixa, vizinhancaDe } from './catalogo';
import {
  aprenderComABibliotecaEmBlocos, vocabularioAprendido, chaveDeArtista,
  ladosPorConfirmar, registarNomeDoCatalogo, type FaixaParaAprender,
} from '../lib/artistName';
import { guardarCacheExternaLocal, lerCacheExternaLocal } from '../lib/cacheExternaLocal';
import { medirPassagem } from '../lib/trabalhoDeMetadados';
import { medirTrabalho, cederParaInterface } from '../lib/trabalhoLocal';

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
  // A biblioteca entrega as linhas primeiro; o processamento não corre na
  // mesma pilha do toque que abriu a página.
  void cederParaInterface().then(() => confirmarArtistas(faixas))
    .catch(() => { /* Sem rede fica o que se aprendeu localmente. */ })
    .then(mudou => { if (mudou) avisarQueOsNomesMudaram(); });
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
const confirmacoes = new Map<string, { em: number; pronto: Promise<boolean> }>();
const VALIDADE = 30 * 86400_000;

function confirmarPar(lados: string[]): Promise<boolean> {
  const chave = lados.map(chaveDeArtista).join('|');
  const anterior = confirmacoes.get(chave);
  if (anterior && Date.now() - anterior.em < VALIDADE) return anterior.pronto;
  let pronto!: Promise<boolean>;
  pronto = (async () => {
    const localKey = `deezer:par-confirmado:v1:${JSON.stringify(lados.map(chaveDeArtista))}`;
    const local = await lerCacheExternaLocal(localKey, VALIDADE);
    const nomes = local?.payload;
    if (Array.isArray(nomes) && nomes.length === 2 && nomes.every(n => n === null || typeof n === 'string')) {
      lados.forEach((nome, i) => registarNomeDoCatalogo(nome, nomes[i]));
      const mudou = nomes.some(Boolean);
      confirmacoes.set(chave, { em: local!.em, pronto: Promise.resolve(false) });
      return mudou;
    }
    const respostas = await Promise.all(lados.map(nome => vizinhancaDe(nome)));
    const confirmados = respostas.map(r => r?.artista.nome ?? null);
    let mudou = false;
    lados.forEach((nome, i) => {
      const confirmado = respostas[i]?.artista.nome ?? null;
      registarNomeDoCatalogo(nome, confirmado);
      mudou ||= !!confirmado;
    });
    if (respostas.every(r => r === null)) {
      const [esquerda, direita] = lados;
      const [a, b] = await Promise.all([artistaDaFaixa(direita!, esquerda!), artistaDaFaixa(esquerda!, direita!)]);
      if (a && !b) { registarNomeDoCatalogo(esquerda!, a); confirmados[0] = a; mudou = true; }
      if (b && !a) { registarNomeDoCatalogo(direita!, b); confirmados[1] = b; mudou = true; }
    }
    // Uma confirmação concluída, incluindo "não encontrei", não se repete
    // a cada leitura da biblioteca. A LRU de 600 respostas era menor do que
    // uma biblioteca real e expulsava-as antes da passagem seguinte.
    if (confirmacoes.get(chave)?.pronto === pronto) {
      confirmacoes.set(chave, { em: Date.now(), pronto: Promise.resolve(false) });
    }
    // Guardar o resultado compacto do par evita refazer as quatro pesquisas
    // no próximo arranque, mesmo se as respostas grandes já saíram da LRU.
    void guardarCacheExternaLocal(localKey, { payload: confirmados, em: Date.now() });
    return mudou;
  })().catch(e => {
    if (confirmacoes.get(chave)?.pronto === pronto) confirmacoes.delete(chave);
    throw e;
  });
  confirmacoes.set(chave, { em: Date.now(), pronto });
  if (confirmacoes.size > 3000) confirmacoes.delete(confirmacoes.keys().next().value!);
  return pronto;
}

export async function confirmarArtistas(faixas: readonly FaixaParaAprender[]): Promise<boolean> {
  let localMs = 0;
  const medir = <T>(tarefa: string, fn: () => T): T => {
    const inicio = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try { return medirTrabalho(tarefa, fn); }
    finally { localMs += (typeof performance !== 'undefined' ? performance.now() : Date.now()) - inicio; }
  };
  await aprenderComABibliotecaEmBlocos(faixas, cederParaInterface, fn => medir('artists.learn.batch', fn));
  const vocabulario = vocabularioAprendido();
  const pares = new Map<string, string[]>();
  for (let inicio = 0; inicio < faixas.length; inicio += 100) {
    medir('artists.pairs', () => { for (const faixa of faixas.slice(inicio, inicio + 100)) {
    const lados = ladosPorConfirmar(faixa, vocabulario);
    if (lados.length !== 2) continue;
    pares.set(lados.map(chaveDeArtista).join('|'), lados);
    } });
    if (inicio + 100 < faixas.length) await cederParaInterface();
  }
  medirPassagem(faixas.length, pares.size, Math.round(localMs));
  // Três trabalhadores limitam os pedidos de cache; o catálogo também regula a rede.
  const fila = [...pares.values()];
  let indice = 0;
  let mudou = false;
  await Promise.all(Array.from({ length: Math.min(3, fila.length) }, async () => {
    while (indice < fila.length) {
      const lados = fila[indice++];
      try {
        mudou = await confirmarPar(lados!) || mudou;
      } catch {
        // Não aprender nada de uma falha temporária. A biblioteca continua disponível.
      }
    }
  }));
  if (mudou) {
    const antes = localMs;
    await aprenderComABibliotecaEmBlocos(faixas, cederParaInterface, fn => medir('artists.learn.confirmed.batch', fn));
    medirPassagem(faixas.length, 0, Math.round(localMs - antes));
  }
  return mudou;
}
