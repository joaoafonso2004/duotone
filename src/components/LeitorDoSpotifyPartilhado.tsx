import React, { useEffect, useRef } from 'react';
import type { Consultar } from '../lib/leitorWebDoSpotify';
import { leitorFechado, leitorPronto, useLeitorPartilhado } from '../state/leitorPartilhadoDoSpotify';
import { LeitorDoSpotifyEscondido, type LeitorDoSpotify } from './LeitorDoSpotify';

/**
 * A WebView escondida do leitor do Spotify para as leituras que vêm de fora
 * do ecrã da conta (20/11; as regras estão em `state/leitorPartilhadoDoSpotify.ts`).
 * Só existe enquanto alguém está a ler.
 */
export function LeitorDoSpotifyPartilhado() {
  const aberto = useLeitorPartilhado((s) => s.pedidos > 0);
  return aberto ? <Aberto /> : null;
}

function Aberto() {
  const leitor = useRef<LeitorDoSpotify>(null);
  useEffect(() => () => leitorFechado(), []);
  // Uma consulta que encontrou o leitor mudado tenta uma vez mais: a página já releu os hashes.
  const consultar: Consultar = async (nome, variaveis) => {
    if (!leitor.current) return { ok: false, falha: 'desligado' };
    const r = await leitor.current.consultar(nome, variaveis);
    return !r.ok && r.falha === 'mudou' && leitor.current ? leitor.current.consultar(nome, variaveis) : r;
  };
  return <LeitorDoSpotifyEscondido ref={leitor} aoPronto={() => leitorPronto(consultar)} />;
}
