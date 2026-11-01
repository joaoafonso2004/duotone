import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CICLO_MAXIMO_MS, FRASES_DO_CARREGAMENTO } from '../lib/luz';
import { COR, ESP, ESTADO, LINHA_LISTA, RAIO, TIPO } from './tokens.web';
import { marcar } from './ui.web';

/**
 * Uma só luz a carregar, no PC (C10, 1/11, `docs/elevacao-maquete.html`).
 *
 * Em vez da roda com "Loading…" numa caixa de altura fixa (120 a 350 px, e a
 * página saltava quando o conteúdo chegava; a do artista tinha três ao mesmo
 * tempo), as formas do que vai chegar, com a altura delas, em metal escuro, e
 * UM reflexo em diagonal a passar pela região inteira: as formas partilham o
 * mesmo gradiente, preso à janela (`background-attachment: fixed`, regras na
 * casca), e cada uma mostra o seu bocado da mesma banda. O fundo não acende.
 *
 * Aos 4 s o reflexo pára e aparece "Still loading…", com "Try again" quando
 * quem carrega sabe tentar outra vez. Com menos movimento, as formas sem luz.
 */
export type FormaDoCarregamento = 'linhas' | 'grelha' | 'capas' | 'blocos';

function Forma({ largura, altura, raio = RAIO.ctrl, redonda = false }: { largura: number | `${number}%`; altura: number; raio?: number; redonda?: boolean }) {
  return <View {...marcar('forma')} style={{ width: largura as any, height: altura, borderRadius: redonda ? altura / 2 : raio }} />;
}

/** Uma faixa de uma lista: a capa, o título e o artista, na altura da linha. */
function Linha({ i }: { i: number }) {
  return (
    <View style={{ height: LINHA_LISTA, flexDirection: 'row', alignItems: 'center', gap: ESP.md, paddingHorizontal: ESP.sm }}>
      <Forma largura={40} altura={40} />
      <View style={{ flex: 1, gap: 7 }}>
        {/* Larguras diferentes por linha: todas iguais liam-se como uma grelha vazia. */}
        <Forma largura={`${46 - (i % 3) * 8}%`} altura={10} />
        <Forma largura={`${28 - (i % 2) * 6}%`} altura={8} />
      </View>
      <Forma largura={34} altura={8} />
    </View>
  );
}

/** Um cartão de uma grelha: a capa quadrada e duas linhas. */
function Cartao({ i, lado }: { i: number; lado: number }) {
  return (
    <View style={{ width: lado, gap: ESP.sm }}>
      <Forma largura={lado} altura={lado} raio={RAIO.cartao} />
      <Forma largura={`${80 - (i % 3) * 15}%`} altura={11} />
      <Forma largura="45%" altura={9} />
    </View>
  );
}

export function Carregando({ forma, quantas, aoTentar }: {
  forma: FormaDoCarregamento;
  /** Quantas formas: as que cabem no primeiro ecrã chegam (o resto ninguém vê). */
  quantas?: number;
  /** Tentar outra vez, aos 4 s. Sem isto só se diz "Still loading…". */
  aoTentar?: () => void;
}) {
  const [ainda, setAinda] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setAinda(true), CICLO_MAXIMO_MS);
    return () => clearTimeout(id);
  }, []);

  let formas: React.ReactNode;
  if (forma === 'linhas') {
    formas = Array.from({ length: quantas ?? 8 }, (_, i) => <Linha key={i} i={i} />);
  } else if (forma === 'grelha') {
    formas = (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: ESP.xxl, rowGap: ESP.xxl }}>
        {Array.from({ length: quantas ?? 8 }, (_, i) => <Cartao key={i} i={i} lado={168} />)}
      </View>
    );
  } else if (forma === 'capas') {
    formas = (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: ESP.md }}>
        {Array.from({ length: quantas ?? 4 }, (_, i) => (
          <View key={i} {...marcar('forma')} style={{ width: '47%', aspectRatio: 1, borderRadius: RAIO.cartao }} />
        ))}
      </View>
    );
  } else {
    // As estatísticas e as retrospetivas: um bloco grande e uma grelha de pequenos.
    formas = (
      <View style={{ gap: ESP.lg }}>
        <Forma largura="100%" altura={132} raio={RAIO.superficie} />
        <View style={{ flexDirection: 'row', gap: ESP.lg }}>
          {Array.from({ length: quantas ?? 4 }, (_, i) => <View key={i} style={{ flex: 1 }}><Forma largura="100%" altura={78} raio={RAIO.cartao} /></View>)}
        </View>
        {Array.from({ length: 4 }, (_, i) => <Linha key={i} i={i} />)}
      </View>
    );
  }

  return (
    <View accessibilityLabel={ainda ? FRASES_DO_CARREGAMENTO.ainda : 'Loading'} {...marcar('formas', ...(ainda ? [] : ['carregando']))}>
      {/* Por cima das formas e não antes delas: aos 4 s nada salta. */}
      {ainda ? (
        <View accessibilityRole={'status' as any} style={{
          position: 'absolute', top: 0, left: 0, zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: ESP.sm,
          height: 32, paddingLeft: ESP.md, paddingRight: ESP.xs, borderRadius: RAIO.pilula,
          backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linha,
        }}>
          <Text style={{ ...TIPO.legenda, color: COR.textoMedio }}>{FRASES_DO_CARREGAMENTO.ainda}</Text>
          {aoTentar ? (
            <Pressable accessibilityRole="button" onPress={aoTentar} {...marcar('premir')}
              style={({ hovered }: any) => ({ paddingHorizontal: ESP.sm, height: 26, justifyContent: 'center', borderRadius: RAIO.ctrl, backgroundColor: hovered ? ESTADO.hover : 'transparent' })}>
              <Text style={{ ...TIPO.legenda, fontWeight: '600', color: COR.texto, textDecorationLine: 'underline' }}>{FRASES_DO_CARREGAMENTO.tentar}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {formas}
    </View>
  );
}
