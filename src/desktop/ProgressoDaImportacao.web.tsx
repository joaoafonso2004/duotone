import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useMusicSearch } from '../hooks/useMusicSearch';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { avisarErro } from '../lib/avisoDeRemocao';
import { FRASES_DA_PESQUISA } from '../lib/estadoDaPesquisa';
import { frasesDaImportacao } from '../lib/frasesDaImportacao';
import { importacaoEmDestaque, useImportacoes, type Importacao } from '../state/importacoes';
import { usePlayer } from '../state/player';
import type { Track } from '../types';
import { COR, ESP, ESTADO, RAIO, TIPO } from './tokens.web';
import { Artwork, Dialog, Field, formatTime, IconButton } from './ui.web';

const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };

const FEITA_MS = 8000;

/**
 * A playlist a entrar, no PC (26/9): uma linha na lateral, por baixo da
 * conta, com a barra. As frases são as mesmas do iPhone
 * (lib/frasesDaImportacao.ts); no fim diz o que entrou e sai sozinha -- menos
 * quando ficaram músicas de fora (5/11): aí fica, e "N not found" mostra quais.
 */
export function ProgressoDaImportacao() {
  const lista = useImportacoes((s) => s.lista);
  const imp = importacaoEmDestaque(lista);
  const [verFaltas, setVerFaltas] = useState(false);
  const acabou = imp?.estado === 'feita' || imp?.estado === 'falhou';
  const faltaram = imp?.resultado?.faltaram ?? [];
  useEffect(() => {
    if (!imp || !acabou || faltaram.length) return;
    const t = setTimeout(() => useImportacoes.getState().dispensar(imp.id), FEITA_MS);
    return () => clearTimeout(t);
  }, [imp?.id, acabou, faltaram.length]);
  // A última encontrada à mão fecha a lista: já não há nada para mostrar.
  useEffect(() => { if (verFaltas && !faltaram.length) setVerFaltas(false); }, [verFaltas, faltaram.length]);
  if (!imp) return null;
  const { titulo, linha, fracao } = frasesDaImportacao(imp, lista.filter((i) => i.estado === 'na-fila').length);
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`${titulo}. ${linha}`}
      style={{ marginHorizontal: ESP.md, marginTop: ESP.sm, padding: ESP.md, borderRadius: RAIO.cartao, backgroundColor: 'rgba(233,234,238,0.04)', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={imp.estado === 'falhou' ? 'alert-circle-outline' : acabou ? 'checkmark-circle' : 'cloud-download-outline'} size={16} color={COR.textoMedio} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ ...TIPO.legenda, fontWeight: '600', color: COR.texto }}>{titulo}</Text>
          <Text numberOfLines={1} style={{ ...TIPO.legenda, color: COR.textoFraco, marginTop: 1 }}>{linha}</Text>
        </View>
        {acabou ? (
          <Pressable accessibilityLabel="Dismiss" onPress={() => useImportacoes.getState().dispensar(imp.id)} hitSlop={8}>
            <Ionicons name="close" size={14} color={COR.textoFraco} />
          </Pressable>
        ) : null}
      </View>
      {!acabou ? (
        <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(233,234,238,0.12)', overflow: 'hidden' }}>
          <View style={{ height: 3, width: `${Math.round((fracao ?? 0.04) * 100)}%`, backgroundColor: COR.texto, transition: 'width 400ms var(--dt-curva)' } as any} />
        </View>
      ) : null}
      {acabou && faltaram.length ? (
        <Pressable accessibilityRole="button" onPress={() => setVerFaltas(true)}
          style={({ hovered }: any) => [{ alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 6, marginLeft: 20, borderRadius: RAIO.ctrl }, hovered && { backgroundColor: ESTADO.hover }]}>
          <Text style={{ ...TIPO.legenda, color: COR.texto, fontWeight: '600', textDecorationLine: 'underline' }}>See the songs not found</Text>
        </Pressable>
      ) : null}
      {/* Num portal para o `body`, como os outros diálogos da lateral: dentro
          dela ficava preso aos 232 px e por baixo do conteúdo. Só existe aberto. */}
      {verFaltas && typeof document !== 'undefined' ? createPortal(
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 300 } as any}>
          <Dialog open title={`Not found (${faltaram.length})`} width={560} onClose={() => setVerFaltas(false)}>
            <FaltasDaImportacao imp={imp} faltaram={faltaram} />
          </Dialog>
        </View>,
        document.body,
      ) : null}
    </View>
  );
}

/** Quantos resultados se mostram por música: os primeiros chegam quase sempre. */
const RESULTADOS_POR_FALTA = 5;

/**
 * A lista "Not found" (9/11, o João: "não havia uma maneira rápida de procurar
 * cada música, podia dar para clicar no título e pesquisava automático"). Cada
 * nome é um botão: abre-se ali mesmo com a pesquisa da app, e o resultado
 * certo entra no destino da importação com o +. A que entrou sai da lista, e a
 * seguinte abre-se no lugar dela -- 18 de seguida sem sair do diálogo.
 */
function FaltasDaImportacao({ imp, faltaram }: { imp: Importacao; faltaram: string[] }) {
  const [aberta, setAberta] = useState<number | null>(null);
  // A última da lista saiu: fecha-se, em vez de ficar aberta uma que não existe.
  useEffect(() => { if (aberta != null && aberta >= faltaram.length) setAberta(null); }, [aberta, faltaram.length]);
  const destino = imp.resultado?.destino === 'gostadas' ? 'your Liked Songs' : (imp.resultado?.nome ?? imp.nome ?? 'the playlist');
  return <>
    <Text style={{ ...TIPO.legenda, color: COR.textoMedio, marginBottom: ESP.md }}>
      No good match turned up for these, so they were left out. Click one to search for it and add it to {destino}.
    </Text>
    <ScrollView style={{ maxHeight: 440 }}>
      {faltaram.map((n, i) => aberta === i
        // A chave leva o nome: a que entra no lugar de uma que saiu monta de novo e pesquisa.
        ? <FaltaAberta key={`${i}:${n}`} imp={imp} nome={n} destino={destino} aoFechar={() => setAberta(null)} />
        : <Pressable key={`${i}:${n}`} accessibilityRole="button" accessibilityLabel={`Search for ${n}`}
            {...({ 'aria-expanded': false } as any)}
            onPress={() => setAberta(i)}
            style={({ hovered, focused }: any) => [{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, paddingHorizontal: ESP.sm, paddingVertical: 6, borderRadius: RAIO.cartao }, (hovered || focused) && { backgroundColor: ESTADO.hover }]}>
            <Text numberOfLines={1} style={{ ...TIPO.corpo, color: COR.texto, flex: 1, minWidth: 0 }}>{n}</Text>
            <Ionicons name="search" size={14} color={COR.textoFraco} />
          </Pressable>)}
    </ScrollView>
  </>;
}

/** Uma das que faltaram, aberta: a pesquisa com o nome (que se pode corrigir) e os resultados. */
function FaltaAberta({ imp, nome, destino, aoFechar }: { imp: Importacao; nome: string; destino: string; aoFechar: () => void }) {
  const [texto, setTexto] = useState(nome);
  // A mesma pesquisa da página Search: a biblioteca primeiro, depois o resto.
  const { results, naBiblioteca, loading, errorMsg, pesquisarAgora } = useMusicSearch(texto, () => {});
  // A primeira vai já, sem a espera de quem ainda está a escrever.
  useEffect(() => { pesquisarAgora(); }, []);
  const vistas = new Set<string>();
  const faixas = [...naBiblioteca.slice(0, 2), ...results].filter((t) => {
    const chave = `${t.source}:${t.sourceId}`;
    if (t.source !== 'youtube' || vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  }).slice(0, RESULTADOS_POR_FALTA);
  return <View style={{ marginVertical: ESP.xs, padding: ESP.sm, borderRadius: RAIO.cartao, backgroundColor: 'rgba(233,234,238,0.04)', gap: ESP.sm }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Close the search for ${nome}`} {...({ 'aria-expanded': true } as any)} onPress={aoFechar}
      style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, paddingHorizontal: ESP.xs }}>
      <Text numberOfLines={1} style={{ ...TIPO.corpo, color: COR.texto, fontWeight: '600', flex: 1, minWidth: 0 }}>{nome}</Text>
      <Ionicons name="chevron-up" size={14} color={COR.textoFraco} />
    </Pressable>
    <Field icon="search" value={texto} onChangeText={setTexto} placeholder="Search for this song" accessibilityLabel={`Search for ${nome}`}
      onSubmitEditing={pesquisarAgora} />
    {loading && !faixas.length
      ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, padding: ESP.sm }}>
          <ActivityIndicator size={14} color={COR.textoMedio} />
          <Text style={{ ...TIPO.legenda, color: COR.textoMedio }}>Searching…</Text>
        </View>
      : !faixas.length
        ? <Text style={{ ...TIPO.legenda, color: COR.textoMedio, padding: ESP.sm }}>{errorMsg ?? `${FRASES_DA_PESQUISA.semResultados}. ${FRASES_DA_PESQUISA.semResultadosCorpo}`}</Text>
        : faixas.map((t) => <ResultadoDaFalta key={`${t.source}:${t.sourceId}`} imp={imp} nome={nome} faixa={t} destino={destino} />)}
  </View>;
}

/** Um resultado: ▶ para ouvir antes, + para pôr no destino da importação. */
function ResultadoDaFalta({ imp, nome, faixa, destino }: { imp: Importacao; nome: string; faixa: Track; destino: string }) {
  const [aPor, setAPor] = useState(false);
  const titulo = tituloDaFaixa(faixa);
  const adicionar = async () => {
    if (aPor) return;
    setAPor(true);
    try {
      await useImportacoes.getState().resolverFalta(imp.id, nome, faixa);
    } catch {
      avisarErro(`Couldn't add "${titulo}". Try again.`);
      setAPor(false);
    }
  };
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.md, paddingHorizontal: ESP.xs }}>
    <Artwork track={faixa} size={36} />
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ ...TIPO.corpo, color: COR.texto, fontWeight: '600' }}>{titulo}</Text>
      <Text numberOfLines={1} style={{ ...TIPO.legenda, color: COR.textoMedio }}>
        {displayArtist(faixa)}{faixa.durationSeconds ? ` · ${formatTime(faixa.durationSeconds)}` : ''}
      </Text>
    </View>
    <IconButton name="play" label={`Play ${titulo}`} onPress={() => void usePlayer.getState().tocarLista([faixa], false)} />
    {aPor
      ? <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size={16} color={COR.texto} /></View>
      : <IconButton name="add" label={`Add ${titulo} to ${destino}`} onPress={() => void adicionar()} />}
  </View>;
}
