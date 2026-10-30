import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { sugestoesParaAPlaylist } from '../lib/sugestoesDaPlaylist';
import { trackKey } from '../lib/shuffle';
import { useRecomendacoes } from '../state/recomendacoes';
import type { Track } from '../types';
import { Artwork, Button } from './ui.web';
import { COR, ESP, FONT, TIPO } from './tokens.web';

/**
 * "Add something that fits" no fim de uma playlist (30/10; o João disse que sim,
 * maquete `docs/pc-elevar-maquete.html`): até cinco músicas para juntar com um
 * clique. Só em playlists em que se pode mexer, e sem pesquisa à frente.
 *
 * Nenhum pedido novo: saem do que a Home já tem em memória
 * (`lib/sugestoesDaPlaylist.ts`). Se as prateleiras ainda não chegaram, ou não
 * há nada que sirva, a secção nem aparece (e esta página não as manda buscar).
 * Juntar uma sai da lista e entra outra: a lista vive da playlist.
 */
export function SugestoesDaPlaylist({ faixas, aoJuntar }: { faixas: readonly Track[]; aoJuntar: (t: Track) => Promise<void> }) {
  const descobrir = useRecomendacoes((s) => s.descobrir);
  const flow = useRecomendacoes((s) => s.flow);
  const esquecidas = useRecomendacoes((s) => s.esquecidas);
  const [aJuntar, setAJuntar] = useState<string | null>(null);
  const sugestoes = useMemo(() => sugestoesParaAPlaylist(faixas, [descobrir, flow, esquecidas]), [faixas, descobrir, flow, esquecidas]);
  if (!sugestoes.length) return null;
  const juntar = async (t: Track) => {
    if (aJuntar) return;
    setAJuntar(trackKey(t));
    try { await aoJuntar(t); } finally { setAJuntar(null); }
  };
  return <View style={estilos.seccao} accessibilityRole={'region' as any} accessibilityLabel="Suggested for this playlist">
    <Text style={estilos.etiqueta}>SUGGESTED FOR THIS PLAYLIST</Text>
    <Text accessibilityRole="header" style={estilos.titulo}>Add something that fits</Text>
    {sugestoes.map((t) => {
      const chave = trackKey(t);
      return <View key={chave} style={estilos.linha}>
        <Artwork track={t} size={44} />
        <View style={estilos.texto}>
          <Text numberOfLines={1} style={estilos.nome}>{tituloDaFaixa(t)}</Text>
          <Text numberOfLines={1} style={estilos.artista}>{displayArtist(t)}</Text>
        </View>
        <Button secondary icon="add" ocupado={aJuntar === chave} disabled={!!aJuntar && aJuntar !== chave} onPress={() => void juntar(t)}>Add</Button>
      </View>;
    })}
  </View>;
}

const estilos = StyleSheet.create({
  seccao: { paddingTop: ESP.xxl, paddingBottom: ESP.lg, gap: ESP.sm },
  etiqueta: { ...TIPO.micro, color: COR.textoFraco },
  titulo: { fontFamily: FONT.display, fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: COR.texto, marginBottom: ESP.sm },
  linha: { flexDirection: 'row', alignItems: 'center', gap: ESP.md, paddingVertical: ESP.xs },
  texto: { flex: 1, minWidth: 0, gap: 2 },
  nome: { ...TIPO.corpo, color: COR.texto, fontWeight: '600' as any },
  artista: { ...TIPO.corpo, color: COR.textoMedio },
});
