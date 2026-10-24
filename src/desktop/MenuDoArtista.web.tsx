import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getLibrary } from '../api/library';
import { fotoJaConhecida } from '../api/catalogo';
import { lembrarCanalDoArtista } from '../api/albunsDoArtista';
import { agruparPorArtista, chaveDeArtista } from '../lib/artistName';
import { chaveDoAtalho, estaFixado, type Atalho } from '../lib/atalhosDaLateral';
import { faixasEmCache } from '../lib/cacheDaBiblioteca';
import { legendaDoMenuDoArtista, menuDoArtista, type AcaoDoArtista } from '../lib/menuDoArtista';
import { useDestinos } from '../navigation/destinos';
import { useArtistasFavoritos } from '../state/artistasFavoritos';
import { useAtalhosDaLateral } from '../state/atalhosDaLateral';
import { comCatalogo } from '../state/catalogoDeFaixas';
import { useConnectivity } from '../state/connectivity';
import { tocarMixDoArtista } from '../state/mixDoArtista';
import { usePlayer } from '../state/player';
import type { Track } from '../types';
import { MenuDeContexto, pontoDoEvento, type LinhaDoMenu, type PontoNoEcra } from './MenuDeContexto.web';
import { COR } from './tokens.web';

/** Quem é o artista do menu. `canal`: o da pesquisa, para abrir o certo (homónimos). */
export type ArtistaDoMenu = { nome: string; canal?: string | null; capa?: string | null };

/** As músicas dele na biblioteca em memória: abrir o menu não vai à rede. */
function tuasDoArtista(nome: string): Track[] {
  const faixas = faixasEmCache(getLibrary);
  if (!faixas) return [];
  const alvo = chaveDeArtista(nome);
  return agruparPorArtista(faixas.map(comCatalogo)).find((g) => g.chave === alvo)?.faixas ?? [];
}

/**
 * O botão direito num artista (24/10, `lib/menuDoArtista.ts`): o estado e o
 * menu para quem o mostra. `artistaDoMenu` é a chave do que está aberto, para
 * o cartão ficar marcado enquanto o menu está aberto.
 */
export function useMenuDoArtista(notify: (texto: string) => void) {
  const [alvo, setAlvo] = useState<{ artista: ArtistaDoMenu; rato: PontoNoEcra } | null>(null);
  const abrirMenuDoArtista = useCallback((artista: ArtistaDoMenu, e: any) => {
    e?.preventDefault?.();
    setAlvo({ artista, rato: pontoDoEvento(e) });
  }, []);
  const menuDoArtista = alvo
    ? <MenuDoArtista artista={alvo.artista} rato={alvo.rato} notify={notify} aoFechar={() => setAlvo(null)} />
    : null;
  return { abrirMenuDoArtista, menuDoArtista, artistaDoMenu: alvo ? chaveDeArtista(alvo.artista.nome) : null };
}

/**
 * O menu de um artista. `extras`: as linhas do sítio onde abriu (mover um
 * atalho da lateral), que entram antes do "Unpin from sidebar".
 */
export function MenuDoArtista({ artista, rato, notify, aoFechar, extras }: {
  artista: ArtistaDoMenu;
  rato: PontoNoEcra;
  notify: (texto: string) => void;
  aoFechar: () => void;
  extras?: { linhas: LinhaDoMenu[]; aoEscolher: (id: string) => void };
}) {
  const { irPara } = useDestinos();
  const semRede = useConnectivity((s) => s.offline);
  const chave = chaveDeArtista(artista.nome);
  const favorito = useArtistasFavoritos((s) => s.chaves.has(chave));
  const tuas = useMemo(() => tuasDoArtista(artista.nome), [artista.nome]);
  const atalho: Atalho = { tipo: 'artista', nome: artista.nome, capa: artista.capa ?? tuas[0]?.artworkUrl ?? null };
  const fixado = useAtalhosDaLateral((s) => estaFixado(s.lista, chaveDoAtalho(atalho)));
  useEffect(() => {
    void useArtistasFavoritos.getState().carregar();
    if (!useAtalhosDaLateral.getState().carregados) void useAtalhosDaLateral.getState().carregar();
  }, []);
  // Só a foto que o aparelho já sabe: abrir um menu não pede nada.
  const foto = fotoJaConhecida(artista.nome) ?? artista.capa ?? tuas[0]?.artworkUrl ?? null;

  const doArtista: LinhaDoMenu[] = menuDoArtista({ semRede, tuas: tuas.length, favorito, fixado })
    .map((l) => ({ id: l.id, rotulo: l.rotulo, icone: l.icone, inicioDeGrupo: l.inicioDeGrupo, motivo: l.motivo }));
  const linhas = extras
    ? [...doArtista.filter((l) => l.id !== 'fixar'), ...extras.linhas.map((l, i) => (i === 0 ? { ...l, inicioDeGrupo: true } : l)),
      ...doArtista.filter((l) => l.id === 'fixar')]
    : doArtista;

  const fazer = async (id: AcaoDoArtista) => {
    const { nome, canal } = artista;
    if (id === 'abrir') {
      if (canal) lembrarCanalDoArtista(nome, canal);
      irPara({ tipo: 'artista', nome });
    } else if (id === 'mix') {
      const ok = await tocarMixDoArtista(nome, { canal: canal ?? null, faixas: tuas }).catch(() => false);
      if (!ok) notify('Could not load the mix.');
    } else if (id === 'baralhar') {
      const leitor = usePlayer.getState();
      await leitor.playShuffled(tuas, leitor.shuffleInteligente, { tipo: 'artista', nome });
    } else if (id === 'favorito') {
      useArtistasFavoritos.getState().alternar(chave);
    } else if (id === 'fixar') {
      useAtalhosDaLateral.getState().alternar(atalho);
    }
  };

  return <MenuDeContexto
    rato={rato}
    rotulo={`Options for ${artista.nome}`}
    cabecalho={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {foto ? <Image source={{ uri: foto }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COR.elevado }} />
        : <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: COR.elevado, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person" size={18} color={COR.textoFraco} />
          </View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: COR.texto, fontSize: 14, fontWeight: '700' }}>{artista.nome}</Text>
        <Text numberOfLines={1} style={{ color: COR.textoMedio, fontSize: 12, marginTop: 1 }}>{legendaDoMenuDoArtista(tuas.length)}</Text>
      </View>
    </View>}
    linhas={linhas}
    aoEscolher={(id) => {
      if (extras?.linhas.some((l) => l.id === id)) extras.aoEscolher(id);
      else void fazer(id as AcaoDoArtista);
    }}
    aoFechar={aoFechar}
  />;
}
