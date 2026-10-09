import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { lerSessao, type SessaoDeEscuta } from '../api/ouvirJuntos';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { useTheme } from '../state/theme';
import { capaParaLista } from '../lib/capaDoEcraBloqueado';
import { tituloDaFaixa, displayArtist } from '../lib/artistName';
import { hapticNotification } from '../lib/haptics';
import { textoSobre } from '../lib/corDaCapa';
import { Toque } from './Toque';
import { ESCALA } from '../lib/movimento';
import { colors, radii, spacing, type } from '../theme';

/**
 * Um convite para ouvir junto, dentro da conversa.
 *
 * ## O erro que este ficheiro já teve, e que não pode repetir-se
 *
 * A primeira versão lia a sessão para decidir se mostrava "Entrar". Se a
 * leitura viesse vazia, concluía "esta sessão já acabou" e desactivava o botão.
 *
 * Mas a leitura passa pela RLS, e a política não contemplava quem tinha sido
 * convidado e ainda não entrara -- por isso vinha SEMPRE vazia. Resultado: o
 * convite dizia a toda a gente que a sessão tinha acabado, e ninguém entrava
 * nunca. A funcionalidade estava morta desde que nasceu.
 *
 * A política foi corrigida. Mas a lição é outra e é mais importante: **uma
 * leitura que falha não prova que a sessão acabou**. Prova que não se conseguiu
 * ler, o que é coisa diferente, e confundir as duas transformou um problema de
 * permissões num "já acabou" que ninguém conseguia contrariar.
 *
 * Por isso agora quem decide é o SERVIDOR, no momento de entrar: o
 * `entrar_na_sessao` é `security definer`, não passa por políticas, e sabe
 * mesmo se a sessão acabou. A leitura serve só para enfeitar o cartão com a
 * capa e o título. Se falhar, perde-se o enfeite -- não o botão.
 */
export function ConviteDeSessao({ id, mensagem, minha = false, quem }: {
  id: string; mensagem: string | null;
  /** Fora de um balão (9/10): o convite é o próprio cartão, do lado de quem o mandou. */
  minha?: boolean;
  /** Quem convidou: "nuno invited you to listen". */
  quem?: string;
}) {
  const tema = useTheme((s) => s.theme);
  const [sessao, setSessao] = useState<SessaoDeEscuta | null>(null);
  const [aEntrar, setAEntrar] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);
  const juntarSe = useOuvirJuntos((s) => s.juntarSe);
  const actual = useOuvirJuntos((s) => s.sessao);

  useEffect(() => {
    let vivo = true;
    void lerSessao(id).then((s) => { if (vivo) setSessao(s); });
    return () => { vivo = false; };
  }, [id]);

  const jaLaEstou = actual?.id === id;
  // SÓ se a leitura foi bem sucedida E diz que acabou. Não se conclui nada de
  // uma leitura vazia -- ver a nota no topo.
  const acabou = !!sessao?.acabouEm;
  const faixa = sessao?.track ?? null;
  const capa = faixa?.artworkUrl ? capaParaLista(faixa.artworkUrl) : null;

  const entrar = async () => {
    if (aEntrar || jaLaEstou) return;
    setAEntrar(true);
    setRecusa(null);
    try {
      await juntarSe(id, 'invite');
      hapticNotification();
    } catch (e: any) {
      // A razão vem do servidor e é dita tal como ele a deu. Inventar uma
      // mensagem aqui foi exactamente o erro da versão anterior.
      const m = String(e?.message ?? '');
      setRecusa(
        /acabou/i.test(m) ? 'This session has ended.'
          : /amigo/i.test(m) ? 'You can only join a friend.'
          : 'Could not join. Try again.'
      );
      void lerSessao(id).then(setSessao);
    } finally {
      setAEntrar(false);
    }
  };

  // Acabou: uma linha ao centro, e não um cartão do tamanho de um ativo.
  if (acabou && !jaLaEstou) {
    return (
      <View style={styles.sistema}>
        <Ionicons name="headset-outline" size={13} color={colors.textTertiary} />
        <Text style={styles.sistemaTexto}>Jam ended</Text>
      </View>
    );
  }

  return (
    <View style={[styles.cartao, { alignSelf: minha ? 'flex-end' : 'flex-start', backgroundColor: minha ? tema.soft : colors.surface }]}>
      {!!mensagem && <Text style={type.body}>{mensagem}</Text>}

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
            <Text numberOfLines={1} style={type.caption}>
              {minha ? 'You invited them to listen' : quem ? `${quem} invited you to listen` : displayArtist(faixa)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.linha}>
          <Ionicons name="headset" size={16} color={tema.color} />
          <Text style={type.body}>{minha ? 'You started a Jam' : quem ? `${quem} invited you to listen` : 'Listen together'}</Text>
        </View>
      )}

      {jaLaEstou ? (
        <View style={styles.dentro}>
          <Ionicons name="checkmark-circle" size={16} color={colors.online} />
          <Text style={[type.caption, { color: colors.online }]}>You're in</Text>
        </View>
      ) : acabou ? (
        <Text style={[type.caption, { color: colors.textTertiary }]}>This session has ended.</Text>
      ) : (
        <>
          <Toque
            escala={ESCALA.botao}
            onPress={entrar}
            disabled={aEntrar}
            accessibilityLabel="Join session"
            style={[styles.botao, { backgroundColor: tema.color, borderColor: tema.color }]}
          >
            {aEntrar ? (
              <ActivityIndicator size="small" color={textoSobre(tema.color)} />
            ) : (
              <Text style={[type.body, { color: textoSobre(tema.color), fontWeight: '700' }]}>Join</Text>
            )}
          </Toque>
          {!!recusa && (
            <Text style={[type.caption, { color: colors.textTertiary }]}>{recusa}</Text>
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
    borderRadius: 20,
    borderCurve: 'continuous',
    width: 280,
    maxWidth: '86%',
  },
  sistema: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  sistemaTexto: { fontSize: 12.5, fontWeight: '600', color: colors.textTertiary },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  etiqueta: { ...type.micro, letterSpacing: 1.2, fontWeight: '700' },
  capa: { width: 52, height: 52, borderRadius: 9 },
  semCapa: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh },
  titulo: { ...type.body, fontWeight: '600' },
  botao: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radii.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  dentro: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
