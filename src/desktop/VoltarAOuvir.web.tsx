import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { NA_HOME, type Recente } from '../lib/recentes';
import { useRecentes } from '../state/recentes';
import type { NavegarFn, Route } from './rotas';
import { COR, ESP, RAIO, TIPO } from './tokens.web';

/** O que o PC sabe reabrir: os álbuns e as prateleiras não têm página aqui. */
function rotaDe(r: Recente): Route | null {
  if (r.tipo === 'guardadas') return { name: 'songs' };
  if (r.tipo === 'playlist' && r.id) return { name: 'playlist', id: r.id, title: r.nome };
  if (r.tipo === 'artista') return { name: 'artist', value: r.nome };
  if (r.tipo === 'mistura' && r.id) return { name: 'mistura', id: r.id, titulo: r.nome };
  return null;
}

/**
 * O "Jump back in" no topo da página principal do PC (5/10, auditoria de
 * consistência A4): os últimos sítios de onde se ouviu, como na Home do
 * iPhone (`state/recentes.ts`, por conta e por aparelho). Os atalhos fixados
 * da lateral continuam: esses escolhe-os a pessoa, estes vêm sozinhos.
 * Com menos de dois, não aparece (um quadrado sozinho não é uma grelha).
 */
export function VoltarAOuvir({ navigate }: { navigate: NavegarFn }) {
  const lista = useRecentes((s) => s.lista);
  const visiveis = lista.map((r) => ({ r, rota: rotaDe(r) })).filter((x) => x.rota).slice(0, NA_HOME);
  if (visiveis.length < 2) return null;
  return (
    <View style={estilos.bloco}>
      <Text accessibilityRole="header" style={estilos.titulo}>Jump back in</Text>
      <View style={estilos.grelha}>
        {visiveis.map(({ r, rota }) => (
          <Pressable
            key={r.chave}
            accessibilityRole="button"
            accessibilityLabel={r.nome}
            onPress={() => navigate(rota!)}
            style={({ hovered }: any) => [estilos.atalho, hovered && estilos.atalhoHover]}
          >
            <Capa r={r} />
            <Text numberOfLines={2} style={estilos.nome}>{r.nome}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Capa({ r }: { r: Recente }) {
  if (r.tipo === 'guardadas') {
    return <View style={[estilos.capa, estilos.capaVazia]}><Ionicons name="heart" size={20} color={COR.texto} /></View>;
  }
  const capas = r.capas.length >= 4 ? r.capas.slice(0, 4) : r.capas.slice(0, 1);
  if (!capas.length) {
    return <View style={[estilos.capa, estilos.capaVazia]}><Ionicons name={r.tipo === 'artista' ? 'person' : 'musical-notes'} size={18} color={COR.textoMedio} /></View>;
  }
  return (
    <View style={[estilos.capa, r.tipo === 'artista' && { borderRadius: 28 }]}>
      {capas.map((c, i) => (
        <Image key={i} source={{ uri: capaParaLista(c)! }}
          style={capas.length === 1 ? { width: '100%', height: '100%' } : { width: '50%', height: '50%' }} />
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloco: { marginBottom: ESP.xl },
  titulo: { ...TIPO.seccao, fontSize: 18, color: COR.texto, marginBottom: ESP.md },
  grelha: { flexDirection: 'row', flexWrap: 'wrap', gap: ESP.sm },
  atalho: {
    flexBasis: 260, flexGrow: 1, maxWidth: '33%', flexDirection: 'row', alignItems: 'center', gap: ESP.md,
    paddingRight: ESP.md, borderRadius: RAIO.cartao, backgroundColor: 'rgba(233,234,238,0.05)', overflow: 'hidden',
  } as any,
  atalhoHover: { backgroundColor: 'rgba(233,234,238,0.1)' },
  capa: { width: 56, height: 56, flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden', backgroundColor: COR.elevado },
  capaVazia: { flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'center' },
  nome: { ...TIPO.corpo, flex: 1, minWidth: 0, color: COR.texto, fontWeight: '600' as any },
});
