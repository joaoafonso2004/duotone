import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { faixaDaBarraDoNome, ladosDoNomeNaBarra } from '../lib/tituloQueEncolhe';
import { BOTAO_DE_VIDRO, BotoesDoPerfil, ESPACO_ENTRE_BOTOES } from './ProfileHero';
import { colors, SOCIAL_GUTTER } from './socialTokens';

/**
 * O que fica por cima do perfil no iPhone, fora do scroll: a barra com o nome,
 * que aparece quando o nome grande passa por baixo dela, e os botões (voltar,
 * mensagens, Definições, estatísticas). No PC não existe (`CimaDoPerfil.web.tsx`): os
 * botões vivem dentro do cabeçalho. Saiu de dentro do `SocialProfileView`
 * (5/10, auditoria T5), onde eram dois `!web&&`.
 */
export function CimaDoPerfil({ nome, rolagem, fimDoNome, own, unread, onBack, onSocial, onSettings, onStats }: {
  nome: string; rolagem: Animated.Value; fimDoNome: number; own: boolean; unread: number;
  onBack?: () => void; onSocial?: () => void; onSettings?: () => void; onStats?: () => void;
}) {
  const safe = useSafeAreaInsets();
  const altura = safe.top + 56;
  // Os mesmos botões que o `BotoesDoPerfil` mostra, para o nome não lhes passar por cima (11/11).
  const lados = ladosDoNomeNaBarra({
    voltar: !!onBack,
    aDireita: [own && onSocial, own && onSettings, onStats].filter(Boolean).length,
    margem: SOCIAL_GUTTER,
    botao: BOTAO_DE_VIDRO,
    espaco: ESPACO_ENTRE_BOTOES,
  });
  return <>
    {/* Antes o conteúdo passava por baixo da ilha sem fundo nenhum. */}
    <Animated.View pointerEvents="none" style={[estilos.barra, {
      height: altura,
      opacity: rolagem.interpolate({ inputRange: faixaDaBarraDoNome(fimDoNome, altura), outputRange: [0, 1], extrapolate: 'clamp' }),
    }]}>
      <BlurView tint="dark" intensity={60} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(6,6,8,0.72)' }]} />
      <Text numberOfLines={1} style={[estilos.nomeNaBarra, {
        marginLeft: lados.esquerda, marginRight: lados.direita, textAlign: lados.centrado ? 'center' : 'left',
      }]}>{nome}</Text>
    </Animated.View>
    <BotoesDoPerfil own={own} unread={unread} onBack={onBack} onSocial={onSocial} onSettings={onSettings} onStats={onStats} />
  </>;
}

const estilos = StyleSheet.create({
  // `stretch`: o nome ocupa a linha entre as margens dos botões, e o
  // `textAlign` decide se fica ao centro ou à esquerda.
  barra: { position: 'absolute', top: 0, left: 0, right: 0, justifyContent: 'flex-end', alignItems: 'stretch', paddingBottom: 16, overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  nomeNaBarra: { fontSize: 17, fontWeight: '600', color: colors.text },
});
