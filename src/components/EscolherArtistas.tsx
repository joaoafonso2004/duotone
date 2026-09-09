import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { procurarArtistas } from '../api/catalogo';
import { jaChegam, SEMENTES_PEDIDAS } from '../lib/artistasSemente';
import { hapticSelection } from '../lib/haptics';
import { getArtistasSemente, setArtistasSemente } from '../lib/prefs';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { Input } from './Input';
import { PillButton } from './PillButton';

const LADO = 84;

/**
 * "Escolhe três artistas", para uma conta nova ter recomendações no primeiro dia.
 *
 * ## Porque é aqui e não num ecrã de boas-vindas
 *
 * Vive atrás do vazio da Pesquisa -- o sítio onde a falta se nota. Um ecrã de
 * boas-vindas obrigatório é uma porta antes da app; isto é uma resposta a uma
 * página que está vazia e que diz porquê. E desaparece sozinho quando deixa de
 * fazer falta, sem ninguém ter de decidir quando é que a conta deixou de ser
 * nova.
 *
 * ## A pesquisa é a do catálogo
 *
 * O mesmo `/search/artist` que a descoberta já usa -- nenhum caminho novo na
 * ponte do Electron, e os nomes vêm escritos como o catálogo os conhece, que é
 * como as recomendações os vão procurar a seguir.
 */
export function EscolherArtistas({
  visivel,
  aoFechar,
  aoGuardar,
}: {
  visivel: boolean;
  aoFechar: () => void;
  /** Chamado depois de guardar, para quem mostra isto poder recarregar. */
  aoGuardar: () => void;
}) {
  const theme = useTheme((s) => s.theme);
  const [procura, setProcura] = useState('');
  const [resultados, setResultados] = useState<{ nome: string; capa: string | null }[]>([]);
  const [aProcurar, setAProcurar] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [aGuardar, setAGuardar] = useState(false);

  // O que já tinha sido escolhido antes reaparece marcado: reabrir isto para
  // acrescentar um quarto artista não pode obrigar a repetir os três.
  useEffect(() => {
    if (visivel) void getArtistasSemente().then(setEscolhidos).catch(() => {});
  }, [visivel]);

  // Espera-se pelo dedo parar. Sem isto era uma ida ao catálogo por tecla.
  useEffect(() => {
    const termo = procura.trim();
    if (termo.length < 2) { setResultados([]); setAProcurar(false); return; }
    setAProcurar(true);
    let vivo = true;
    const relogio = setTimeout(() => {
      void procurarArtistas(termo)
        .then((r) => { if (vivo) setResultados(r); })
        .catch(() => { if (vivo) setResultados([]); })
        .finally(() => { if (vivo) setAProcurar(false); });
    }, 350);
    return () => { vivo = false; clearTimeout(relogio); };
  }, [procura]);

  const alternar = (nome: string) => {
    hapticSelection();
    setEscolhidos((antes) => antes.includes(nome)
      ? antes.filter((n) => n !== nome)
      : [...antes, nome]);
  };

  const guardar = async () => {
    setAGuardar(true);
    try {
      await setArtistasSemente(escolhidos);
      aoGuardar();
      aoFechar();
    } finally {
      setAGuardar(false);
    }
  };

  const faltam = Math.max(0, SEMENTES_PEDIDAS - escolhidos.length);

  return (
    <BottomSheet visible={visivel} onClose={aoFechar}>
      <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
        <Text style={type.title}>Who do you listen to?</Text>
        <Text style={type.caption}>
          {faltam > 0
            ? `Pick ${faltam} more and the app has something to go on.`
            : `${escolhidos.length} picked. You can always add more later.`}
        </Text>

        <Input
          icon="search"
          placeholder="Search artists…"
          value={procura}
          onChangeText={setProcura}
          onClear={() => setProcura('')}
          autoCapitalize="words"
          autoCorrect={false}
        />

        {/* Os escolhidos ficam à vista mesmo depois de a procura mudar: sem
            isto, escrever um nome novo fazia desaparecer o que já se tinha. */}
        {escolhidos.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {escolhidos.map((nome) => (
              <Pressable
                key={nome}
                onPress={() => alternar(nome)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${nome}`}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingVertical: 6, paddingHorizontal: spacing.md,
                  borderRadius: radii.pill, backgroundColor: theme.soft,
                }}
              >
                <Text numberOfLines={1} style={[type.caption, { color: theme.color, maxWidth: 160 }]}>{nome}</Text>
                <Ionicons name="close" size={14} color={theme.color} />
              </Pressable>
            ))}
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }} style={{ minHeight: LADO + 42 }}>
          {aProcurar && resultados.length === 0 ? (
            <ActivityIndicator color={colors.textSecondary} style={{ marginVertical: spacing.xl, marginHorizontal: spacing.xl }} />
          ) : resultados.map((a) => {
            const marcado = escolhidos.includes(a.nome);
            return (
              <Pressable
                key={a.nome}
                onPress={() => alternar(a.nome)}
                accessibilityRole="button"
                accessibilityState={{ selected: marcado }}
                style={{ width: LADO, alignItems: 'center', gap: 6 }}
              >
                <View style={{
                  width: LADO, height: LADO, borderRadius: LADO / 2,
                  overflow: 'hidden', backgroundColor: colors.surfaceHigh,
                  borderWidth: marcado ? 2 : 0, borderColor: theme.color,
                }}>
                  {a.capa ? (
                    <Image source={{ uri: a.capa }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person" size={28} color={colors.textTertiary} />
                    </View>
                  )}
                </View>
                <Text numberOfLines={1} style={[type.micro, { color: marcado ? theme.color : colors.textSecondary, textAlign: 'center', width: LADO }]}>
                  {a.nome}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <PillButton
          label={aGuardar ? 'Saving…' : 'Done'}
          loading={aGuardar}
          disabled={!jaChegam(escolhidos) || aGuardar}
          onPress={() => void guardar()}
        />
      </View>
    </BottomSheet>
  );
}
