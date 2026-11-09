import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useMusicSearch } from '../hooks/useMusicSearch';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { avisarErro } from '../lib/avisoDeRemocao';
import { FRASES_DA_PESQUISA } from '../lib/estadoDaPesquisa';
import { usePlayer } from '../state/player';
import type { Track } from '../types';
import { COR, ESP, RAIO, TIPO } from './tokens.web';
import { Artwork, Button, Field, formatTime, IconButton } from './ui.web';

/** Quantos resultados se mostram: os primeiros chegam quase sempre. */
const RESULTADOS = 5;

/**
 * Procurar uma música ali mesmo, sem sair de onde se está (9/11).
 *
 * Nasceu na lista "Not found" da importação (o João: "podia dar para clicar no
 * título e pesquisava automático") e serve também o Library check, para as que
 * deixaram de tocar e não têm cópia segura. A pesquisa é a da página Search
 * (`useMusicSearch`: a biblioteca primeiro), já a correr com o nome, que se
 * corrige na caixa. Cada resultado tem ▶ para ouvir e a ação de quem a usa:
 * o + da importação ou o Replace do Library check.
 */
export function PesquisaNaLinha({ titulo, textoInicial, acao, aoEscolher, aoFechar, ouvirDesligado = false, aoOuvir }: {
  /** O que se procura, por cima da caixa (carregar nele fecha). */
  titulo: string;
  textoInicial: string;
  /** `mais`: um + (juntar à lista); `replace`: o botão "Replace" (trocar). */
  acao: { tipo: 'mais' | 'replace'; rotulo: (tituloDoResultado: string) => string };
  aoEscolher: (faixa: Track) => Promise<void>;
  aoFechar: () => void;
  /** Num Jam ouvir é sugerir à sala: o Library check desliga o ▶. */
  ouvirDesligado?: boolean;
  aoOuvir?: (faixa: Track) => void;
}) {
  const [texto, setTexto] = useState(textoInicial);
  const { results, naBiblioteca, loading, errorMsg, pesquisarAgora } = useMusicSearch(texto, () => {});
  // A primeira vai já, sem a espera de quem ainda está a escrever.
  useEffect(() => { pesquisarAgora(); }, []);
  const vistas = new Set<string>();
  const faixas = [...naBiblioteca.slice(0, 2), ...results].filter((t) => {
    const chave = `${t.source}:${t.sourceId}`;
    if (t.source !== 'youtube' || vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  }).slice(0, RESULTADOS);
  return <View style={{ marginVertical: ESP.xs, padding: ESP.sm, borderRadius: RAIO.cartao, backgroundColor: 'rgba(233,234,238,0.04)', gap: ESP.sm }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Close the search for ${titulo}`} {...({ 'aria-expanded': true } as any)} onPress={aoFechar}
      style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, paddingHorizontal: ESP.xs }}>
      <Text numberOfLines={1} style={{ ...TIPO.corpo, color: COR.texto, fontWeight: '600', flex: 1, minWidth: 0 }}>{titulo}</Text>
      <Ionicons name="chevron-up" size={14} color={COR.textoFraco} />
    </Pressable>
    <Field icon="search" value={texto} onChangeText={setTexto} placeholder="Search for this song" accessibilityLabel={`Search for ${titulo}`}
      onSubmitEditing={pesquisarAgora} />
    {loading && !faixas.length
      ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm, padding: ESP.sm }}>
          <ActivityIndicator size={14} color={COR.textoMedio} />
          <Text style={{ ...TIPO.legenda, color: COR.textoMedio }}>Searching…</Text>
        </View>
      : !faixas.length
        ? <Text style={{ ...TIPO.legenda, color: COR.textoMedio, padding: ESP.sm }}>{errorMsg ?? `${FRASES_DA_PESQUISA.semResultados}. ${FRASES_DA_PESQUISA.semResultadosCorpo}`}</Text>
        : faixas.map((t) => <Resultado key={`${t.source}:${t.sourceId}`} faixa={t} acao={acao} aoEscolher={aoEscolher}
            ouvirDesligado={ouvirDesligado} aoOuvir={aoOuvir} />)}
  </View>;
}

function Resultado({ faixa, acao, aoEscolher, ouvirDesligado, aoOuvir }: {
  faixa: Track; acao: { tipo: 'mais' | 'replace'; rotulo: (t: string) => string };
  aoEscolher: (faixa: Track) => Promise<void>; ouvirDesligado: boolean; aoOuvir?: (faixa: Track) => void;
}) {
  const [aFazer, setAFazer] = useState(false);
  const titulo = tituloDaFaixa(faixa);
  const fazer = async () => {
    if (aFazer) return;
    setAFazer(true);
    try {
      await aoEscolher(faixa);
    } catch {
      avisarErro(`Couldn't use "${titulo}". Try again.`);
    } finally {
      // Correu bem e a linha sai; ou falhou, e quem a usa pode ter dito porquê no
      // sítio dele (o Library check guarda o erro e mostra-o na linha).
      setAFazer(false);
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
    {ouvirDesligado ? null : <IconButton name="play" label={`Play ${titulo}`}
      onPress={() => (aoOuvir ? aoOuvir(faixa) : void usePlayer.getState().tocarLista([faixa], false))} />}
    {acao.tipo === 'replace'
      ? <Button ocupado={aFazer} onPress={() => void fazer()}>Replace</Button>
      : aFazer
        ? <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size={16} color={COR.texto} /></View>
        : <IconButton name="add" label={acao.rotulo(titulo)} onPress={() => void fazer()} />}
  </View>;
}
