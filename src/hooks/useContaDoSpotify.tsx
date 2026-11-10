import React, { useRef, useState } from 'react';
import { LeitorDoSpotifyEscondido, LoginDoSpotify, type LeitorDoSpotify } from '../components/LeitorDoSpotify';
import { avisarErro } from '../lib/avisoDeRemocao';
import { abrirPeloLeitor, ErroDoLeitor, mensagemDoLeitor, type BibliotecaLida, type Consultar, type FalhaDoLeitor } from '../lib/leitorWebDoSpotify';

/**
 * Ligar à conta do Spotify no iPhone, pelo leitor web (11/11): o leitor
 * escondido abre o open.spotify.com; com a sessão aberta, lê-se a biblioteca;
 * sem ela, abre-se o login do Spotify numa folha, e depois recarrega-se o
 * leitor (os dois partilham os cookies do WKWebView).
 *
 * Usado pelo cartão de importar (`ImportarDaContaDoSpotify`) e pelo "Use my
 * Spotify instead" das boas-vindas (`EscolherArtistas`). As `pecas` têm de
 * estar no ecrã enquanto `fase !== 'parado'`: é por elas que as consultas
 * passam, também ao ler as listas depois de abertas.
 */

export type FaseDaConta = 'parado' | 'a-ligar' | 'login' | 'pronta';
/** Sem resposta do leitor neste tempo, desiste-se (sem rede, ou o Spotify em baixo). */
const ESPERA_PELO_LEITOR_MS = 40_000;

export function useContaDoSpotify(aoAbrir: (b: BibliotecaLida) => void) {
  const [fase, setFaseNoEcra] = useState<FaseDaConta>('parado');
  const leitor = useRef<LeitorDoSpotify>(null);
  const faseAgora = useRef<FaseDaConta>('parado');
  const aTentar = useRef(false);
  const pediuLogin = useRef(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aoAbrirAgora = useRef(aoAbrir);
  aoAbrirAgora.current = aoAbrir;

  const setFase = (f: FaseDaConta) => { faseAgora.current = f; setFaseNoEcra(f); };
  const pararORelogio = () => { if (relogio.current) clearTimeout(relogio.current); relogio.current = null; };
  const parar = () => {
    pararORelogio();
    aTentar.current = false;
    pediuLogin.current = false;
    setFase('parado');
  };
  const falhar = (tipo: FalhaDoLeitor | 'vazio') => { parar(); avisarErro(mensagemDoLeitor(tipo)); };
  const esperarPeloLeitor = () => {
    pararORelogio();
    relogio.current = setTimeout(() => { if (faseAgora.current === 'a-ligar') falhar('rede'); }, ESPERA_PELO_LEITOR_MS);
  };

  // Uma consulta que encontrou o leitor mudado tenta uma vez mais: a página já releu os hashes.
  const consultar: Consultar = async (nome, variaveis) => {
    if (!leitor.current) return { ok: false, falha: 'desligado' };
    const r = await leitor.current.consultar(nome, variaveis);
    return !r.ok && r.falha === 'mudou' && leitor.current ? leitor.current.consultar(nome, variaveis) : r;
  };

  const ligar = () => {
    if (faseAgora.current !== 'parado') return;
    pediuLogin.current = false;
    setFase('a-ligar');
    esperarPeloLeitor();
  };

  /** A página tem os cabeçalhos do leitor: lê-se a biblioteca, ou pede-se o login. */
  const tentar = async () => {
    if (faseAgora.current !== 'a-ligar' || aTentar.current || !leitor.current) return;
    aTentar.current = true;
    pararORelogio();
    try {
      const b = await abrirPeloLeitor(consultar);
      setFase('pronta');
      aoAbrirAgora.current(b);
    } catch (e) {
      const tipo = e instanceof ErroDoLeitor ? e.tipo : 'rede';
      // Sem sessão, o leitor abre como anónimo: o login, uma vez.
      if (tipo === 'desligado' && !pediuLogin.current) { pediuLogin.current = true; setFase('login'); }
      else falhar(tipo);
    } finally {
      aTentar.current = false;
    }
  };

  const entrou = () => {
    if (faseAgora.current !== 'login') return;
    setFase('a-ligar');
    esperarPeloLeitor();
    // O cookie do login chega ao leitor escondido pelo WKWebView: basta recarregá-lo.
    setTimeout(() => leitor.current?.recarregar(), 600);
  };

  const pecas = (
    <>
      {fase !== 'parado' ? <LeitorDoSpotifyEscondido ref={leitor} aoPronto={() => void tentar()} /> : null}
      <LoginDoSpotify visivel={fase === 'login'} aoEntrar={entrou} aoCancelar={parar} />
    </>
  );

  return { fase, ligar, parar, pecas };
}
