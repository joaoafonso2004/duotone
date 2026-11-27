import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, radii, spacing, type } from '../theme';
import type { Ancora } from './MenuFlutuante';
import { Toque } from './Toque';
import { RealceDaLinha } from './RealceDaLinha';

/**
 * A lista agrupada dos Ajustes do iPhone (auditoria 1.6, variante B de
 * `docs/definicoes-prateleiras-abertura.html`, 4/10): grupos de linhas de
 * 48 pt com um ícone num quadrado, o valor à direita, › no que abre outra
 * coisa, e o que a opção está a fazer agora no RODAPÉ do grupo.
 *
 * Uma linha com escolha não tem o controlo à vista: mostra o valor e abre um
 * menu junto ao dedo (`aoTocar` recebe onde ela está no ecrã).
 */

const ICONE = 28;
const ESQUERDA_DO_TRACO = spacing.lg + ICONE + spacing.md;

export { RealceDaLinha };
const useAcesa = (rotulo: string) => useContext(RealceDaLinha) === rotulo;

/**
 * Um grupo que mostra as principais e abre o resto ali mesmo (27/11, as Definições
 * por secções, `docs/definicoes-por-seccoes-maquete.html`): por baixo, "More · N
 * more" abre e "Less" fecha, com a altura a crescer. O rodapé do resto só se lê aberto.
 */
/** As linhas, com os fragmentos desdobrados (`resto={<>...</>}`) e sem as vazias. */
function linhasDe(no: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(no).flatMap((c) => (React.isValidElement(c) && c.type === React.Fragment
    ? linhasDe((c.props as { children?: React.ReactNode }).children) : [c]));
}

export function GrupoQueAbre({ titulo, rodape, rodapeDoResto, children, resto, aberto, aoAlternar, aoMedir }: {
  titulo: string;
  rodape?: string | (string | null | undefined | false)[] | null;
  rodapeDoResto?: string | (string | null | undefined | false)[] | null;
  children: React.ReactNode;
  resto?: React.ReactNode;
  aberto: boolean;
  aoAlternar: () => void;
  /** Onde o grupo está no conteúdo (para a procura lá rolar). */
  aoMedir?: (y: number) => void;
}) {
  const principais = linhasDe(children);
  const outras = linhasDe(resto);
  const [altura, setAltura] = useState(0);
  const abertura = useRef(new Animated.Value(aberto ? 1 : 0)).current;
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; abertura.setValue(aberto ? 1 : 0); return undefined; }
    // A altura não anda no motor nativo: é JavaScript, 280 ms numa página parada.
    const a = Animated.timing(abertura, { toValue: aberto ? 1 : 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [aberto, abertura]);
  const listas = (Array.isArray(rodape) ? rodape : [rodape]);
  const doResto = aberto ? (Array.isArray(rodapeDoResto) ? rodapeDoResto : [rodapeDoResto]) : [];
  const frases = [...listas, ...doResto].filter((f): f is string => !!f);
  const comTraco = (linha: React.ReactNode, i: number) => (
    <View key={i}>
      {i > 0 && <View style={styles.traco} />}
      {linha}
    </View>
  );
  return (
    <View style={styles.bloco} onLayout={aoMedir ? (e) => aoMedir(e.nativeEvent.layout.y) : undefined}>
      <Text accessibilityRole="header" style={styles.titulo}>{titulo}</Text>
      <View style={styles.grupo}>
        {principais.map(comTraco)}
        {outras.length ? (
          <>
            <Animated.View style={{ height: abertura.interpolate({ inputRange: [0, 1], outputRange: [0, altura] }), overflow: 'hidden' }}
              accessibilityElementsHidden={!aberto} importantForAccessibility={aberto ? 'auto' : 'no-hide-descendants'}>
              {/* Medida à parte (absoluta), para a altura aberta se saber fechada. */}
              <View style={styles.medida} onLayout={(e) => setAltura(e.nativeEvent.layout.height)}>
                {outras.map((linha, i) => comTraco(linha, i + 1))}
              </View>
            </Animated.View>
            <View style={styles.traco} />
            <Toque acende accessibilityRole="button" accessibilityState={{ expanded: aberto }}
              accessibilityLabel={aberto ? `Show fewer ${titulo} settings` : `Show all ${titulo} settings`}
              onPress={aoAlternar} style={styles.linha}>
              <Text style={[styles.rotulo, styles.mais]}>{aberto ? 'Less' : 'More'}</Text>
              {aberto ? null : <Text style={styles.valor}>{`${outras.length} more`}</Text>}
              <Animated.View style={{ transform: [{ rotate: abertura.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
                <Ionicons name="chevron-down" size={17} color="rgba(233,234,238,0.45)" />
              </Animated.View>
            </Toque>
          </>
        ) : null}
      </View>
      {frases.length > 0 && (
        <View style={styles.rodape}>
          {frases.map((f) => <Text key={f} style={styles.textoDoRodape}>{f}</Text>)}
        </View>
      )}
    </View>
  );
}

export function Grupo({ titulo, rodape, children }: {
  titulo?: string;
  /** Uma ou mais frases; as vazias não contam. */
  rodape?: string | (string | null | undefined | false)[] | null;
  children: React.ReactNode;
}) {
  const frases = (Array.isArray(rodape) ? rodape : [rodape]).filter((f): f is string => !!f);
  // O traço entre linhas: só ENTRE elas, e recuado até ao texto (como no iOS).
  const linhas = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.bloco}>
      {titulo ? <Text accessibilityRole="header" style={styles.titulo}>{titulo}</Text> : null}
      <View style={styles.grupo}>
        {linhas.map((linha, i) => (
          <View key={i}>
            {i > 0 && <View style={styles.traco} />}
            {linha}
          </View>
        ))}
      </View>
      {frases.length > 0 && (
        <View style={styles.rodape}>
          {frases.map((f) => <Text key={f} style={styles.textoDoRodape}>{f}</Text>)}
        </View>
      )}
    </View>
  );
}

type Comum = {
  icone: keyof typeof Ionicons.glyphMap;
  rotulo: string;
  desativada?: boolean;
};

/**
 * Uma linha. Com `aoTocar` é um botão (acende ao toque); `chevron` diz que
 * abre outra coisa, `acao` que faz uma coisa ali mesmo, `perigo` a vermelho.
 */
export function Linha({
  icone, rotulo, valor, antesDoValor, chevron, acao, perigo, aCarregar, desativada, aoTocar, accessibilityHint,
}: Comum & {
  valor?: string | null;
  /** Ao lado do valor (uma amostra de cor, por exemplo). */
  antesDoValor?: React.ReactNode;
  chevron?: boolean;
  acao?: boolean;
  perigo?: boolean;
  aCarregar?: boolean;
  aoTocar?: (ancora: Ancora) => void;
  accessibilityHint?: string;
}) {
  const ref = useRef<View>(null);
  const acesa = useAcesa(rotulo);
  const corpo = (
    <>
      <QuadradoDoIcone icone={icone} perigo={perigo} desativada={desativada} />
      <Text
        numberOfLines={1}
        style={[styles.rotulo, acao && styles.acao, perigo && { color: colors.danger }, desativada && styles.apagada]}
      >
        {rotulo}
      </Text>
      {antesDoValor}
      {valor ? <Text numberOfLines={1} style={[styles.valor, desativada && styles.apagada]}>{valor}</Text> : null}
      {aCarregar ? <ActivityIndicator size="small" color={colors.textSecondary} /> : null}
      {chevron ? <Ionicons name="chevron-forward" size={17} color="rgba(233,234,238,0.32)" /> : null}
    </>
  );
  if (!aoTocar) {
    return (
      <View style={[styles.linha, acesa && styles.acesa]} accessible accessibilityLabel={valor ? `${rotulo}, ${valor}` : rotulo}>
        {corpo}
      </View>
    );
  }
  return (
    <View ref={ref} collapsable={false} style={acesa ? styles.acesa : undefined}>
      <Toque
        acende
        // A carregar continua a poder tocar-se: "Identify library" pára assim.
        disabled={desativada}
        accessibilityRole="button"
        accessibilityLabel={valor ? `${rotulo}, ${valor}` : rotulo}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled: !!(desativada || aCarregar), busy: !!aCarregar }}
        onPress={() => {
          const r = ref.current;
          if (!r) return;
          r.measureInWindow((x, y, width, height) => aoTocar({ x, y, width, height }));
        }}
        style={styles.linha}
      >
        {corpo}
      </Toque>
    </View>
  );
}

/** Uma linha com um interruptor. */
export function LinhaInterruptor({ icone, rotulo, valor, aoMudar, desativada }: Comum & {
  valor: boolean;
  aoMudar: (v: boolean) => void;
}) {
  const acesa = useAcesa(rotulo);
  return (
    <View style={[styles.linha, acesa && styles.acesa]}>
      <QuadradoDoIcone icone={icone} desativada={desativada} />
      <Text numberOfLines={1} style={[styles.rotulo, desativada && styles.apagada]}>{rotulo}</Text>
      <Switch
        accessibilityLabel={rotulo}
        value={valor}
        disabled={desativada}
        onValueChange={aoMudar}
        trackColor={{ false: colors.surfacePressed, true: colors.text }}
        thumbColor="#fff"
      />
    </View>
  );
}

/** Uma linha mais alta: o rótulo em cima e um controlo por baixo (a velocidade). */
export function LinhaAlta({ icone, rotulo, children }: Comum & { children: React.ReactNode }) {
  const acesa = useAcesa(rotulo);
  return (
    <View style={[styles.alta, acesa && styles.acesa]}>
      <View style={styles.cimaDaAlta}>
        <QuadradoDoIcone icone={icone} />
        <Text numberOfLines={1} style={styles.rotulo}>{rotulo}</Text>
      </View>
      <View style={{ marginLeft: ICONE + spacing.md }}>{children}</View>
    </View>
  );
}

function QuadradoDoIcone({ icone, perigo, desativada }: { icone: Comum['icone']; perigo?: boolean; desativada?: boolean }) {
  return (
    <View style={[styles.icone, desativada && styles.apagada]}>
      <Ionicons name={icone} size={17} color={perigo ? colors.danger : colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: { gap: 7 },
  titulo: {
    fontSize: 13, fontWeight: '600', color: colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: spacing.xl,
  },
  grupo: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  traco: {
    height: StyleSheet.hairlineWidth,
    marginLeft: ESQUERDA_DO_TRACO,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  linha: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
  },
  alta: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 2 },
  cimaDaAlta: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icone: {
    width: ICONE,
    height: ICONE,
    borderRadius: radii.sm,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotulo: { ...type.body, fontSize: 16, flex: 1 },
  acao: { fontWeight: '500' },
  valor: { ...type.body, fontSize: 16, color: colors.textSecondary, flexShrink: 1, maxWidth: '55%' },
  apagada: { opacity: 0.4 },
  // A linha que a procura encontrou (27/11).
  acesa: { backgroundColor: 'rgba(255,255,255,0.12)' },
  mais: { color: colors.textSecondary },
  medida: { position: 'absolute', left: 0, right: 0, top: 0 },
  rodape: { paddingHorizontal: spacing.xl, gap: 2 },
  textoDoRodape: { ...type.caption, fontWeight: '400', lineHeight: 18 },
});
