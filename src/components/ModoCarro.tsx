import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { hapticImpact } from '../lib/haptics';
import { getCarroMantemEcra } from '../lib/prefs';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';

/**
 * Modo carro: o leitor para se ver de relance e acertar sem olhar.
 *
 * ## O que muda não é o estilo, é o TAMANHO DOS ALVOS
 *
 * Toda a gente faz um "modo carro" que é o mesmo ecrã com letras maiores. O
 * que interessa num carro é outra coisa: acertar no botão sem tirar os olhos
 * da estrada. Por isso os três controlos ocupam **um terço do ecrã cada um**
 * na horizontal, e o do meio -- o play, que é o que se procura -- é o maior.
 *
 * Nada aqui tem hitSlop a compensar um botão pequeno: os botões SÃO grandes.
 *
 * ## O que NÃO está cá
 *
 * Equalizador, velocidade, fila, letras, partilhar, coração. Não porque não
 * caibam -- porque cada coisa a mais é uma coisa em que se pode carregar por
 * engano a 90 km/h. Um modo que faz tudo não é um modo, é o mesmo ecrã.
 *
 * O que resta é: o que está a tocar, o que vem a seguir, e três botões.
 *
 * ## O ecrã não apaga -- a não ser que se peça
 *
 * Ligado por omissão, porque é metade do que o modo carro é: um ecrã que apaga
 * a cada trinta segundos num suporte obriga a tocá-lo para o acordar, que é
 * exactamente o que não se quer estar a fazer a conduzir. Desligável nas
 * Definições, para quem prefira a bateria.
 *
 * Com uma etiqueta própria, para não mexer na definição de quem já tem o
 * "manter o ecrã ligado" desligado -- sair do modo carro devolve o telemóvel
 * exactamente ao estado em que ele estava.
 */
export function ModoCarro({ visivel, aoFechar }: { visivel: boolean; aoFechar: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const tema = useTheme((s) => s.theme);
  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const positionMs = usePlayer((s) => s.positionMs);
  const durationMs = usePlayer((s) => s.durationMs);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const prev = usePlayer((s) => s.prev);
  // NAO `usePlayer(s => s.peekNextTrack())`: um selector que CHAMA uma funcao
  // devolve um valor novo a cada leitura e poe o `useSyncExternalStore` num
  // ciclo -- ja aconteceu nesta app e a versao nao arrancava. Subscreve-se o
  // que muda (a fila e o indice) e chama-se de fora.
  const fila = usePlayer((s) => s.queue);
  const indice = usePlayer((s) => s.queueIndex);
  const seguinte = React.useMemo(() => usePlayer.getState().peekNextTrack(), [fila, indice]);

  useEffect(() => {
    if (!visivel) return;
    let vivo = true;
    // A preferencia le-se ao ABRIR e nao uma vez na vida: quem a mudar nas
    // Definicoes ve o efeito no modo carro seguinte, sem reiniciar a app.
    void getCarroMantemEcra().then((manter) => {
      if (vivo && manter) void activateKeepAwakeAsync('modo-carro').catch(() => {});
    }).catch(() => {});
    return () => {
      vivo = false;
      // Sempre, mesmo que nao se tenha chegado a ligar: a etiqueta e nossa e
      // largar uma que nao existe nao faz nada.
      try { deactivateKeepAwake('modo-carro'); } catch { /* já estava */ }
    };
  }, [visivel]);

  if (!current) return null;
  const fraccao = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  // A capa ocupa o que sobrar depois dos controlos, e nunca mais de metade da
  // altura: num telemóvel deitado no suporte, o que se procura é o texto.
  const lado = Math.min(width - spacing.xl * 2, height * 0.34);
  const grande = Math.min(96, width * 0.24);

  return (
    <Modal visible={visivel} animationType="fade" onRequestClose={aoFechar} statusBarTranslucent>
      <View style={[styles.fundo, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
        {/* Sair fica em cima e pequeno de propósito: é o único botão daqui em
            que NÃO se quer carregar por engano. */}
        <Pressable
          onPress={aoFechar}
          accessibilityRole="button"
          accessibilityLabel="Exit car mode"
          hitSlop={16}
          style={styles.sair}
        >
          <Ionicons name="close" size={26} color={colors.textSecondary} />
        </Pressable>

        <View style={styles.capaCaixa}>
          {current.artworkUrl ? (
            <Image source={{ uri: current.artworkUrl }} style={{ width: lado, height: lado, borderRadius: radii.lg }} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.capaVazia, { width: lado, height: lado }]}>
              <Ionicons name="musical-note" size={lado * 0.3} color={colors.textTertiary} />
            </View>
          )}
        </View>

        <View style={styles.texto}>
          <Text numberOfLines={2} style={styles.titulo}>{tituloDaFaixa(current)}</Text>
          <Text numberOfLines={1} style={styles.artista}>{displayArtist(current)}</Text>
        </View>

        {/* Uma barra grossa e sem pega: no carro isto é para LER, não para
            arrastar. Procurar uma posição a conduzir é a coisa que não se
            quer fazer. */}
        <View style={styles.barra}>
          <View style={[styles.barraCheia, { width: `${fraccao * 100}%`, backgroundColor: tema.color }]} />
        </View>

        <View style={styles.controlos}>
          <Botao icone="play-skip-back" tamanho={grande * 0.62} aoCarregar={() => { hapticImpact(); void prev(); }} etiqueta="Previous" />
          <Botao
            icone={isPlaying ? 'pause' : 'play'}
            tamanho={grande}
            principal
            cor={tema.color}
            aoCarregar={() => { hapticImpact(); void togglePlay(); }}
            etiqueta={isPlaying ? 'Pause' : 'Play'}
          />
          <Botao icone="play-skip-forward" tamanho={grande * 0.62} aoCarregar={() => { hapticImpact(); void next(); }} etiqueta="Next" />
        </View>

        {/* O que vem a seguir, numa linha. É a única informação a mais que se
            justifica: saber se vale a pena carregar no seguinte. */}
        <Text numberOfLines={1} style={styles.seguinte}>
          {seguinte ? `Next · ${tituloDaFaixa(seguinte)}` : ' '}
        </Text>
      </View>
    </Modal>
  );
}

function Botao({ icone, tamanho, aoCarregar, etiqueta, principal = false, cor }: {
  icone: keyof typeof Ionicons.glyphMap;
  tamanho: number;
  aoCarregar: () => void;
  etiqueta: string;
  principal?: boolean;
  cor?: string;
}) {
  return (
    <Pressable
      onPress={aoCarregar}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      style={({ pressed }) => [styles.alvo, pressed && { opacity: 0.55 }]}
    >
      <View style={[
        styles.circulo,
        { width: tamanho, height: tamanho, borderRadius: tamanho / 2 },
        principal && { backgroundColor: cor },
      ]}>
        <Ionicons
          name={icone}
          size={tamanho * (principal ? 0.46 : 0.72)}
          color={principal ? colors.bg : colors.text}
          style={icone === 'play' ? { marginLeft: tamanho * 0.05 } : undefined}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl, justifyContent: 'space-between' },
  sair: { alignSelf: 'flex-end', padding: spacing.sm },
  capaCaixa: { alignItems: 'center' },
  capaVazia: {
    borderRadius: radii.lg, backgroundColor: colors.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  texto: { gap: 4, alignItems: 'center' },
  // Grande a sério: isto lê-se de um metro, com o telemóvel num suporte.
  titulo: { ...type.largeTitle, fontSize: 34, lineHeight: 38, textAlign: 'center' },
  artista: { ...type.title, fontSize: 20, color: colors.textSecondary, textAlign: 'center' },
  barra: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  barraCheia: { height: '100%', borderRadius: 4 },
  controlos: { flexDirection: 'row', alignItems: 'center' },
  // Um terço do ecrã cada um. É isto que faz o modo carro ser modo carro.
  alvo: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg },
  circulo: { alignItems: 'center', justifyContent: 'center' },
  seguinte: { ...type.caption, fontSize: 15, textAlign: 'center', minHeight: 20 },
});
