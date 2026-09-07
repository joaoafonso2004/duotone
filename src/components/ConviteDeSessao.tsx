import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { lerSessao, type SessaoDeEscuta } from '../api/ouvirJuntos';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { tituloDaFaixa, displayArtist } from '../lib/artistName';
import { hapticNotification } from '../lib/haptics';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import { colors, radii, spacing, type } from '../theme';

/**
 * Um convite para ouvir junto, dentro da conversa.
 *
 * Não há ecrã novo nem caixa de entrada própria: o convite chega ao chat como
 * qualquer partilha, e por isso herda as notificações, o histórico e o facto de
 * um convite que não se viu na altura continuar lá amanhã.
 *
 * O estado é lido no momento em que se desenha, e não guardado na mensagem: uma
 * sessão que já acabou tem de se ver que acabou. Uma mensagem que dissesse
 * "Entrar" para sempre era uma promessa que a app não pode cumprir.
 */
export function ConviteDeSessao({ id, mensagem }: { id: string; mensagem: string | null }) {
  const [sessao, setSessao] = useState<SessaoDeEscuta | null | 'a-ler'>('a-ler');
  const [aEntrar, setAEntrar] = useState(false);
  const juntarSe = useOuvirJuntos((s) => s.juntarSe);
  const actual = useOuvirJuntos((s) => s.sessao);

  useEffect(() => {
    let vivo = true;
    void lerSessao(id).then((s) => { if (vivo) setSessao(s); });
    return () => { vivo = false; };
  }, [id]);

  const jaLaEstou = actual?.id === id;
  const acabou = sessao !== 'a-ler' && (!sessao || !!sessao.acabouEm);
  const faixa = sessao !== 'a-ler' ? sessao?.track ?? null : null;
  const capa = faixa?.artworkUrl ? capaParaLista(faixa.artworkUrl) : null;

  const entrar = async () => {
    if (aEntrar || jaLaEstou || acabou) return;
    setAEntrar(true);
    try {
      await juntarSe(id);
      hapticNotification();
    } catch {
      // Deixa o botão como estava: a razão mais provável é a sessão ter
      // acabado entre o desenho e o toque, e a próxima leitura mostra isso.
      void lerSessao(id).then(setSessao);
    } finally {
      setAEntrar(false);
    }
  };

  return (
    <View style={styles.cartao}>
      <View style={styles.linha}>
        <Ionicons name="headset" size={13} color={colors.accent} />
        <Text style={styles.etiqueta}>OUVIR JUNTOS</Text>
      </View>

      {!!mensagem && <Text style={type.body}>{mensagem}</Text>}

      {sessao === 'a-ler' ? (
        <ActivityIndicator size="small" color={colors.textTertiary} />
      ) : (
        <>
          {faixa ? (
            <View style={styles.linha}>
              {capa ? (
                <Image source={{ uri: capa }} style={styles.capa} contentFit="cover" />
              ) : (
                <View style={[styles.capa, styles.semCapa]}>
                  <Ionicons name="musical-notes" size={14} color={colors.textTertiary} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={styles.titulo}>{tituloDaFaixa(faixa)}</Text>
                <Text numberOfLines={1} style={type.caption}>{displayArtist(faixa)}</Text>
              </View>
            </View>
          ) : null}

          {acabou ? (
            <Text style={[type.caption, { color: colors.textTertiary }]}>
              Esta sessão já acabou.
            </Text>
          ) : jaLaEstou ? (
            <View style={styles.dentro}>
              <Ionicons name="checkmark-circle" size={16} color={colors.online} />
              <Text style={[type.caption, { color: colors.online }]}>Estás nesta sessão</Text>
            </View>
          ) : (
            <Toque
              escala={ESCALA.botao}
              onPress={entrar}
              disabled={aEntrar}
              accessibilityLabel="Entrar na sessão"
              style={styles.botao}
            >
              {aEntrar ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <Text style={[type.body, { color: colors.bg, fontWeight: '700' }]}>Entrar</Text>
              )}
            </Toque>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cartao: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.34)',
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  etiqueta: { ...type.micro, color: colors.accent, letterSpacing: 1.2, fontWeight: '700' },
  capa: { width: 38, height: 38, borderRadius: radii.sm },
  semCapa: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh },
  titulo: { ...type.body, fontWeight: '600' },
  botao: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  dentro: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
