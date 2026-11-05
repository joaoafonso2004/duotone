import { useEffect, useMemo, useState } from 'react';
import { dependenciasReais } from '../api/playlistPorLink';
import { entradaDaImportacao, type Entrada } from '../lib/entradaDaImportacao';
import { ErroDaImportacao, leituraDasLinhas, lerPlaylist, type Leitura } from '../lib/importacaoPorLink';

/**
 * A caixa de importar, pronta a mostrar (5/11, as duas plataformas): o que é
 * (`entradaDaImportacao`) e, para um link, a playlist JÁ LIDA -- um pedido por
 * link colado, que depois vai inteiro para a fila de importações sem se ler
 * outra vez. Uma lista ou um ficheiro leem-se aqui mesmo, sem rede.
 */
export interface Preparada {
  entrada: Entrada;
  leitura: Leitura | null;
  aLer: boolean;
  erro: string | null;
}

/** As leituras desta sessão, por link: colar o mesmo outra vez não volta a pedir. */
const lidas = new Map<string, Leitura>();
const ESPERA_MS = 350;

export function useImportacaoPreparada(texto: string, ficheiro: { nome: string; conteudo: string } | null): Preparada {
  const entrada = useMemo(() => entradaDaImportacao(texto, ficheiro), [texto, ficheiro]);
  const chave = entrada.tipo === 'link' ? JSON.stringify(entrada.link) : null;
  const [lida, setLida] = useState<{ chave: string; leitura: Leitura | null; erro: string | null } | null>(null);

  useEffect(() => {
    if (!chave || entrada.tipo !== 'link') return;
    const guardada = lidas.get(chave);
    if (guardada) { setLida({ chave, leitura: guardada, erro: null }); return; }
    let vivo = true;
    // Espera que se acabe de colar ou de escrever: um pedido por link, não por tecla.
    const t = setTimeout(() => {
      lerPlaylist(entrada.link, dependenciasReais)
        .then((l) => { lidas.set(chave, l); if (vivo) setLida({ chave, leitura: l, erro: null }); })
        .catch((e) => {
          if (!vivo) return;
          setLida({ chave, leitura: null, erro: e instanceof ErroDaImportacao ? e.message : "Couldn't read that playlist. Check your connection and try again." });
        });
    }, ESPERA_MS);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave diz tudo sobre o link
  }, [chave]);

  if (entrada.tipo === 'lista') {
    const leitura = leituraDasLinhas('lista', { nome: entrada.nome, capa: null, faixas: entrada.lista.linhas }, null);
    return { entrada, leitura, aLer: false, erro: null };
  }
  if (entrada.tipo === 'link') {
    const desteLink = lida && lida.chave === chave ? lida : null;
    return { entrada, leitura: desteLink?.leitura ?? null, aLer: !desteLink, erro: desteLink?.erro ?? null };
  }
  return { entrada, leitura: null, aLer: false, erro: null };
}
