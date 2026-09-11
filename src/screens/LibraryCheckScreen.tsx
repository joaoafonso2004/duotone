import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PillButton } from '../components/PillButton';
import { Screen } from '../components/Screen';
import { useOfflineMode } from '../hooks/useOfflineMode';
import { tituloDaFaixa } from '../lib/artistName';
import { hapticSelection } from '../lib/haptics';
import {
  duracaoCurta, motivoDaIndisponivel, resumoDoRelatorio, type GrupoDeDuplicados,
} from '../lib/higieneDaBiblioteca';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { comCatalogo } from '../state/catalogoDeFaixas';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import {
  CHAVE_DO_DESFAZER, chaveDaCapa, chaveDaIndisponivel, chaveDoGrupo, corrigirCapaDe, desfazerUltima,
  juntarGrupo, pararVerificacao, procurarCopiaPara, substituirPelaCopia, useVerificacaoDaBiblioteca,
  verificarBiblioteca, type Indisponivel,
} from '../state/verificacaoDaBiblioteca';
import { colors, MINI_PLAYER_HEIGHT, radii, spacing, type } from '../theme';
import type { Track } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'LibraryCheck'>;

/**
 * "Library check": o que está mal na biblioteca, antes de se dar com isso a
 * tocar. Nada muda sozinho -- cada problema tem o seu botão, e as junções e
 * trocas têm "Undo". A verificação e as ações vivem em
 * `state/verificacaoDaBiblioteca.ts`; o PC desenha a mesma coisa.
 */
export function LibraryCheckScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const offline = useOfflineMode();
  const v = useVerificacaoDaBiblioteca();

  const aVerificar = v.fase === 'a-verificar';
  const pendentes = {
    duplicados: v.duplicados.filter((g) => !v.resolvidos[chaveDoGrupo(g)]).length,
    indisponiveis: v.indisponiveis.filter((i) => !v.resolvidos[chaveDaIndisponivel(i)]).length,
    capas: v.capas.filter((c) => !v.resolvidos[chaveDaCapa(c)]).length,
  };

  return (
    <Screen title="Library check" onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + MINI_PLAYER_HEIGHT + spacing.xxl }}>
        <View style={styles.cabeca}>
          <Text style={[type.body, { color: colors.textSecondary, lineHeight: 21 }]}>
            Finds songs saved twice, videos that no longer play and covers that don&apos;t load.
            Nothing changes until you tap a button.
          </Text>
          {v.progresso ? (
            <Text style={type.caption}>
              {v.progresso.total ? `Checking ${v.progresso.feitas} of ${v.progresso.total}…` : 'Reading your library…'}
            </Text>
          ) : v.fase === 'feita' ? (
            <Text style={styles.resumo}>{resumoDoRelatorio(pendentes)}</Text>
          ) : null}
          {v.interrompida ? <Text style={type.caption}>Stopped before the end — this is what it found so far.</Text> : null}
          <PillButton
            label={aVerificar ? 'Stop' : v.fase === 'feita' ? 'Check again' : 'Check library'}
            variant={aVerificar ? 'ghost' : 'primary'}
            small
            disabled={!aVerificar && offline}
            onPress={() => { hapticSelection(); if (aVerificar) pararVerificacao(); else void verificarBiblioteca(); }}
            style={{ alignSelf: 'flex-start' }}
          />
          {offline && !aVerificar ? <Text style={type.caption}>Needs internet.</Text> : null}
          {v.erro && !v.erroEm ? <Text style={[type.caption, { color: colors.danger }]}>{v.erro}</Text> : null}
        </View>

        {v.ultima ? (
          <View style={styles.desfazer}>
            <Ionicons name="checkmark-circle" size={17} color={colors.online} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={type.body}>{v.ultima.rotulo}</Text>
              <ErroNaLinha chave={CHAVE_DO_DESFAZER} />
            </View>
            <PillButton label="Undo" variant="ghost" small loading={v.aTratar === CHAVE_DO_DESFAZER}
              onPress={() => { hapticSelection(); void desfazerUltima(); }} />
          </View>
        ) : null}

        {v.duplicados.length ? (
          <>
            <Text style={styles.seccao}>SAVED TWICE</Text>
            <Text style={[type.caption, styles.explicacao]}>
              The same recording saved from different uploads. Merge keeps the one you pick, and your playlists move to it.
            </Text>
            {v.duplicados.map((g) => <GrupoDuplicado key={chaveDoGrupo(g)} grupo={g} />)}
          </>
        ) : null}

        {v.indisponiveis.length ? (
          <>
            <Text style={styles.seccao}>NO LONGER PLAYS</Text>
            {v.indisponiveis.map((i) => <LinhaIndisponivel key={chaveDaIndisponivel(i)} item={i} />)}
          </>
        ) : null}

        {v.capas.length ? (
          <>
            <Text style={styles.seccao}>COVERS THAT DON&apos;T LOAD</Text>
            <Text style={[type.caption, styles.explicacao]}>Fix uses the video&apos;s own thumbnail.</Text>
            {v.capas.map((c) => {
              const chave = chaveDaCapa(c);
              const feito = v.resolvidos[chave];
              return (
                <View key={chave}>
                  <View style={styles.linha}>
                    <View style={[styles.capa, styles.semCapa]}>
                      <Ionicons name="image-outline" size={16} color={colors.textTertiary} />
                    </View>
                    <Ionicons name="arrow-forward" size={14} color={colors.textTertiary} />
                    <Image source={{ uri: c.nova }} style={styles.capa} contentFit="cover" />
                    <Texto faixa={c.faixa} />
                    {feito ? <Feito rotulo={feito} /> : (
                      <PillButton label="Fix" variant="ghost" small disabled={offline}
                        loading={v.aTratar === chave} onPress={() => { hapticSelection(); void corrigirCapaDe(c); }} />
                    )}
                  </View>
                  <ErroNaLinha chave={chave} recuo />
                </View>
              );
            })}
          </>
        ) : null}

        {v.fase === 'feita' && !v.duplicados.length && !v.indisponiveis.length && !v.capas.length ? (
          <View style={styles.vazio}>
            <Ionicons name="checkmark-circle-outline" size={32} color={colors.online} />
            <Text style={[type.body, { fontWeight: '600' }]}>Your library is in good shape</Text>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** Uma cópia: a capa que se vê, o título e o canal com a duração. */
function Texto({ faixa, nota }: { faixa: Track; nota?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{tituloDaFaixa(faixa)}</Text>
      <Text numberOfLines={1} style={type.caption}>
        {[faixa.artist, duracaoCurta(faixa.durationSeconds), nota].filter(Boolean).join(' · ')}
      </Text>
    </View>
  );
}

/** O erro da ação deste problema, junto dele: lá em cima podia nem se ver. */
function ErroNaLinha({ chave, recuo = false }: { chave: string; recuo?: boolean }) {
  const erro = useVerificacaoDaBiblioteca((s) => (s.erroEm === chave ? s.erro : null));
  if (!erro) return null;
  return <Text style={[type.caption, { color: colors.danger }, recuo && styles.erroRecuado]}>{erro}</Text>;
}

function Capa({ faixa, apagada = false }: { faixa: Track; apagada?: boolean }) {
  const url = comCatalogo(faixa).artworkUrl;
  return url
    ? <Image source={{ uri: url }} style={[styles.capa, apagada && { opacity: 0.4 }]} contentFit="cover" />
    : <View style={[styles.capa, styles.semCapa]}><Ionicons name="musical-notes" size={16} color={colors.textTertiary} /></View>;
}

function Feito({ rotulo }: { rotulo: string }) {
  return (
    <View style={styles.feito}>
      <Ionicons name="checkmark" size={14} color={colors.online} />
      <Text style={[type.caption, { color: colors.online, fontWeight: '600' }]}>{rotulo}</Text>
    </View>
  );
}

function GrupoDuplicado({ grupo }: { grupo: GrupoDeDuplicados }) {
  const tema = useTheme((s) => s.theme);
  const offline = useOfflineMode();
  const chave = chaveDoGrupo(grupo);
  const feito = useVerificacaoDaBiblioteca((s) => s.resolvidos[chave]);
  const ficou = useVerificacaoDaBiblioteca((s) => s.ficou[chave]);
  const naoTocam = useVerificacaoDaBiblioteca((s) => s.naoTocam);
  const aTratar = useVerificacaoDaBiblioteca((s) => s.aTratar === chave);
  // A proposta vem da lógica (a que toca, e dessas a do canal oficial); quem
  // decide é a pessoa, com um toque na linha.
  const [fica, setFica] = useState(grupo.fica);
  useEffect(() => { setFica(grupo.fica); }, [grupo.fica]);

  return (
    <View style={styles.cartao}>
      {grupo.faixas.map((t) => {
        const escolhida = t.id === fica.id;
        // Depois de juntar, a que saiu fica à vista mas apagada: vê-se qual ficou.
        const saiu = !!feito && !!ficou && t.id !== ficou;
        return (
          <Pressable
            key={t.id}
            disabled={!!feito}
            onPress={() => { hapticSelection(); setFica(t); }}
            accessibilityRole="radio"
            accessibilityState={{ selected: escolhida }}
            accessibilityLabel={`Keep ${tituloDaFaixa(t)} by ${t.artist ?? 'unknown'}`}
            style={[styles.linhaNoCartao, saiu && { opacity: 0.4 }]}
          >
            <Capa faixa={t} />
            <Texto faixa={t} nota={saiu ? 'Removed' : naoTocam.includes(t.sourceId) ? "Doesn't play" : undefined} />
            {!feito ? (
              <Ionicons
                name={escolhida ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={escolhida ? tema.color : colors.textTertiary}
              />
            ) : null}
          </Pressable>
        );
      })}
      <View style={styles.acoesDoCartao}>
        {feito ? <Feito rotulo={feito} /> : (
          <>
            <Text style={[type.caption, { flex: 1 }]}>Keeps the one ticked.</Text>
            <PillButton label="Merge" small disabled={offline} loading={aTratar}
              onPress={() => { hapticSelection(); void juntarGrupo(grupo, fica); }} />
          </>
        )}
      </View>
      <ErroNaLinha chave={chave} recuo />
    </View>
  );
}

function LinhaIndisponivel({ item }: { item: Indisponivel }) {
  const offline = useOfflineMode();
  const emJam = useOuvirJuntos((s) => !!s.sessao);
  const chave = chaveDaIndisponivel(item);
  const feito = useVerificacaoDaBiblioteca((s) => s.resolvidos[chave]);
  const aTratar = useVerificacaoDaBiblioteca((s) => s.aTratar === chave);

  return (
    <View style={styles.cartao}>
      <View style={styles.linhaNoCartao}>
        <Capa faixa={item.faixa} apagada />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{tituloDaFaixa(item.faixa)}</Text>
          <Text numberOfLines={1} style={type.caption}>{motivoDaIndisponivel(item.motivo)}</Text>
        </View>
        {feito ? <Feito rotulo={feito} /> : item.copia === undefined ? (
          <PillButton label="Find a copy" variant="ghost" small disabled={offline} loading={aTratar}
            onPress={() => { hapticSelection(); void procurarCopiaPara(item); }} />
        ) : null}
      </View>
      {!feito && item.copia === null ? (
        <Text style={[type.caption, styles.semCopia]}>No safe copy found. Try again later, or remove it yourself.</Text>
      ) : null}
      {!feito && item.copia ? (
        <>
          <View style={[styles.linhaNoCartao, styles.copia]}>
            <Capa faixa={item.copia} />
            <Texto faixa={item.copia} />
          </View>
          <View style={styles.acoesDoCartao}>
            {/* Ouvir antes de aceitar: é a mesma música, mas quem sabe é o
                ouvido. Toca no leitor normal; num Jam não, porque tocar ali é
                sugerir à sala. */}
            <PillButton label="Listen" variant="ghost" small disabled={emJam || offline}
              onPress={() => { hapticSelection(); void usePlayer.getState().playTrack(item.copia!, [item.copia!]); }} />
            <PillButton label="Replace" small disabled={offline} loading={aTratar}
              onPress={() => { hapticSelection(); void substituirPelaCopia(item); }} />
            {emJam ? <Text style={[type.caption, { flex: 1 }]}>Not during a Jam</Text> : null}
          </View>
        </>
      ) : null}
      <ErroNaLinha chave={chave} recuo />
    </View>
  );
}

const styles = StyleSheet.create({
  cabeca: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    gap: spacing.sm,
  },
  resumo: { fontSize: 20, fontWeight: '800', color: colors.text },
  desfazer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceHigh,
  },
  seccao: {
    ...type.micro,
    letterSpacing: 1.4,
    color: colors.textTertiary,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    marginHorizontal: spacing.md,
  },
  explicacao: { marginHorizontal: spacing.md, marginBottom: spacing.sm, lineHeight: 18 },
  cartao: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  linhaNoCartao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  copia: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  acoesDoCartao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  semCopia: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  erroRecuado: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  capa: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.surfaceHigh },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  feito: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vazio: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
});
