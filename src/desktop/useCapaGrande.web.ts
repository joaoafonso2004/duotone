import { useEffect, useState } from 'react';
import { capaDeRecurso, capaGrandeDaFaixa } from '../lib/capaGrande';

type Faixa = { source: string; sourceId: string; artworkUrl?: string | null };

/**
 * A capa GRANDE do Now Playing do PC (26/9).
 *
 * A capa passou a crescer até 560 px (o "A+", ver `lib/leitorDoPc.ts`), mas
 * continuava a vir do `artworkUrl` -- a `hqdefault` do YouTube, 480x360 com
 * barras pretas: cortada ao quadrado sobram 270 px, esticados para mais de
 * 500. Era o "desfocado e pouco profissional" do João. O leitor do iPhone já
 * usava a `maxresdefault` (1280x720, `lib/capaGrande.ts`); aqui faz-se o mesmo.
 *
 * Mostra-se a que já há enquanto a grande chega, e troca-se quando ela está
 * carregada -- nunca um quadrado vazio. Um vídeo sem maxres não dá erro: o
 * YouTube responde com um cinzento de 120x90, e é pela largura que se vê.
 */
const semMaxres = new Set<string>();
const prontas = new Set<string>();
const LARGURA_DO_CINZENTO = 120;
/** Só as miniaturas do YouTube precisam de troca: a capa do catálogo já é a
 * `cover_xl` do Deezer (1000 px e quadrada), melhor do que qualquer maxres. */
const MINIATURA = /^https?:\/\/i\.ytimg\.com\//;
const precisaDeTroca = (f: Faixa) => f.source === 'youtube' && (!f.artworkUrl || MINIATURA.test(f.artworkUrl));

function sondar(faixa: Faixa): Promise<string | null> {
  if (!precisaDeTroca(faixa)) return Promise.resolve(null);
  const grande = capaGrandeDaFaixa(faixa, semMaxres);
  if (!grande) return Promise.resolve(null);
  if (prontas.has(grande)) return Promise.resolve(grande);
  return new Promise((resolver) => {
    const img = new window.Image();
    const semGrande = () => {
      if (faixa.source === 'youtube') semMaxres.add(faixa.sourceId);
      resolver(null);
    };
    img.onload = () => {
      if (img.naturalWidth <= LARGURA_DO_CINZENTO) { semGrande(); return; }
      prontas.add(grande);
      resolver(grande);
    };
    img.onerror = semGrande;
    img.src = grande;
  });
}

/** Pede já a capa grande de uma faixa (a seguinte), para o skip não esperar por ela. */
export function preCarregarCapaGrande(faixa: Faixa | null | undefined): void {
  if (faixa) void sondar(faixa);
}

function daquiJa(faixa: Faixa): string | null {
  if (!precisaDeTroca(faixa)) return faixa.artworkUrl ?? null;
  const grande = capaGrandeDaFaixa(faixa, semMaxres);
  if (grande && prontas.has(grande)) return grande;
  return faixa.artworkUrl ?? capaDeRecurso(faixa);
}

export function useCapaGrande(faixa: Faixa): string | null {
  // A capa entra na chave: o catálogo pode trazer a dele depois.
  const chave = `${faixa.source}:${faixa.sourceId}:${faixa.artworkUrl ?? ''}`;
  const [melhor, setMelhor] = useState<{ chave: string; uri: string | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    void sondar(faixa).then((uri) => { if (vivo && uri) setMelhor({ chave, uri }); });
    return () => { vivo = false; };
    // A faixa é a mesma enquanto a chave for a mesma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return melhor?.chave === chave ? melhor.uri : daquiJa(faixa);
}
