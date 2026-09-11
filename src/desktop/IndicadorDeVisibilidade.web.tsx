import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { useVisibilidade } from '../hooks/useVisibilidade';
import { avisoDaTroca } from '../lib/visibilidade';
import { definirPrivacidade, usePrivacidade } from '../state/privacidade';
import { COR, RAIO, TIPO } from './tokens.web';

const P = Pressable as any;

/**
 * Abaixo desta largura de janela a pílula perde o texto e fica só o ícone.
 *
 * A coluna da direita da barra é 30% da largura dela. O Jam, o volume e o
 * fechar já levam uns 200 px, e a pílula com texto mais uns 90: abaixo de uns
 * 1010 px de janela não cabe, e nos 960 mínimos do Electron transbordava por
 * cima dos controlos do meio.
 */
const LARGURA_COM_TEXTO = 1040;

/**
 * "Quem vê isto?" -- na barra do leitor, ao lado do Jam.
 *
 * Fora de um Jam, um clique liga ou desliga a escuta privada; dentro de um,
 * abre o Jam, que é onde se muda quem lá está. A regra e os textos são os
 * mesmos do iPhone (lib/visibilidade.ts); aqui só muda a forma.
 */
export function IndicadorDeVisibilidade({ discordLigado, onJam, onAviso }: {
  discordLigado: boolean;
  onJam: () => void;
  onAviso?: (mensagem: string) => void;
}) {
  const v = useVisibilidade(discordLigado);
  const { width } = useWindowDimensions();
  const comTexto = width >= LARGURA_COM_TEXTO;
  // Aceso quando alguém para lá do costume está a ver -- ou ninguém está. O
  // estado normal (amigos) não se anuncia, como o shuffle desligado.
  const aceso = v.estado === 'privada' || v.estado === 'jam';

  const carregar = () => {
    if (v.acao === 'abrirJam') { onJam(); return; }
    const privada = !usePrivacidade.getState().privada;
    void definirPrivacidade(privada);
    onAviso?.(avisoDaTroca(privada, discordLigado));
  };

  return <P
    onPress={carregar}
    accessibilityRole="button"
    accessibilityLabel={`${v.descricao} ${v.dica}.`}
    // A mesma ordem do IconButton: o aceso por último, para o hover não o
    // apagar -- a cor de hover é mais escura do que a de ligado.
    style={({ hovered, focused, pressed }: any) => [
      s.pilula, !comTexto && s.soIcone,
      (hovered || focused) && s.hover, pressed && s.premida, aceso && s.acesa,
    ]}
  >
    <Ionicons name={v.icone} size={15} color={aceso ? COR.texto : COR.textoMedio} />
    {comTexto ? <Text numberOfLines={1} style={[s.texto, aceso && s.textoAceso]}>{v.rotulo}</Text> : null}
  </P>;
}

const s = StyleSheet.create({
  pilula: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 30, paddingHorizontal: 10, marginRight: 4,
    borderRadius: RAIO.pilula, borderWidth: 1, borderColor: COR.linha,
    cursor: 'pointer', transition: 'background-color 0.15s',
  } as any,
  soIcone: { width: 34, paddingHorizontal: 0, justifyContent: 'center', borderColor: 'transparent' },
  acesa: { backgroundColor: COR.metalSuave, borderColor: 'transparent' },
  hover: { backgroundColor: COR.hover },
  premida: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  texto: { ...TIPO.legenda, color: COR.textoMedio },
  textoAceso: { color: COR.texto },
});
