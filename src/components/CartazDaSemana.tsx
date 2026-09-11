import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { lerASemana, valeUmCartaz, type ASemana, type Pessoa } from '../api/aSemana';
import { getSemanaVistaEm, setSemanaVistaEm } from '../lib/prefs';
import { chaveDaSemana, mostrarCartaz } from '../lib/sextaFeira';
import { useAbertura } from '../state/abertura';
import { useAuth } from '../state/auth';
import { useTheme } from '../state/theme';
import { colors, radii, spacing, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { FriendAvatar } from './FriendAvatar';
import { PillButton } from './PillButton';

/**
 * A semana em cinco números, à sexta-feira.
 *
 * ## Aparece sozinho, e por isso tem de merecer
 *
 * É a única coisa nesta app que se põe à frente de alguém sem lhe ser pedida.
 * Isso obriga a duas regras que não são negociáveis:
 *
 *  - **uma vez por semana e nunca mais** -- a janela e a chave vivem no
 *    `lib/sextaFeira.ts`, testadas à parte;
 *  - **só com alguma coisa para dizer** -- numa semana parada não aparece. Um
 *    cartaz que salta ao ecrã para dizer que nada aconteceu é pior do que
 *    cartaz nenhum.
 *
 * ## Sobre o grupo, e sem minutos
 *
 * Os cinco números são sobre o círculo -- tu mais os teus amigos -- e nenhum
 * deles é tempo ouvido. Tempo premeia deixar a tocar para ninguém; estes são
 * todos sobre descobrir e sobre coincidir, que é o que se ganha de propósito.
 */
export function CartazDaSemana() {
  const sessao = useAuth((s) => s.session);
  const tema = useTheme((s) => s.theme);
  const [dados, setDados] = useState<ASemana | null>(null);
  const [aberto, setAberto] = useState(false);
  // Não sobe a meio da abertura do arranque: espera que ela saia.
  const tapado = useAbertura((s) => s.aFrente);

  useEffect(() => {
    if (!sessao) return;
    let vivo = true;
    void (async () => {
      const vistaEm = await getSemanaVistaEm().catch(() => null);
      if (!vivo || !mostrarCartaz(new Date(), vistaEm)) return;
      const d = await lerASemana();
      if (!vivo || !valeUmCartaz(d)) return;
      setDados(d);
      setAberto(true);
      // Marca-se ao MOSTRAR e não ao fechar: quem o dispensar a arrastar não
      // o pode ver outra vez ao mudar de separador.
      void setSemanaVistaEm(chaveDaSemana(new Date())).catch(() => {});
    })();
    return () => { vivo = false; };
  }, [sessao]);

  if (!dados || tapado) return null;
  const nome = (p: Pessoa) => (p.souEu ? 'You' : p.nome || p.username || 'A friend');

  return (
    <BottomSheet visible={aberto} onClose={() => setAberto(false)}>
      <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
        <View style={styles.cabeca}>
          <LinearGradient
            colors={tema.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Text style={[styles.titulo, { color: tema.textColorOnGradient }]}>Your week</Text>
          <Text style={[styles.subtitulo, { color: tema.textColorOnGradient }]}>
            {dados.pessoas > 1 ? `You and ${dados.pessoas - 1} friend${dados.pessoas === 2 ? '' : 's'}` : 'The last seven days'}
          </Text>
        </View>

        {dados.descobridor && dados.descobridor.quantas > 0 && (
          <Linha
            icone="compass-outline"
            etiqueta="Found the most"
            titulo={nome(dados.descobridor)}
            nota={`${dados.descobridor.quantas} new ${dados.descobridor.quantas === 1 ? 'artist' : 'artists'}`}
            avatar={dados.descobridor.avatar}
            avatarNome={nome(dados.descobridor)}
            cor={tema.color}
          />
        )}

        {dados.asTuas > 0 && (
          <Linha
            icone="sparkles-outline"
            etiqueta="You found"
            titulo={`${dados.asTuas} new ${dados.asTuas === 1 ? 'artist' : 'artists'}`}
            nota="first time you have played them"
            cor={tema.color}
          />
        )}

        {dados.artista && (
          <Linha
            icone="mic-outline"
            etiqueta="Artist of the week"
            titulo={dados.artista.nome}
            nota={`${dados.artista.escutas} plays across ${dados.artista.pessoas} of you`}
            capa={dados.artista.capa}
            cor={tema.color}
          />
        )}

        {/* A boa: a que várias pessoas ouviram sem terem combinado nada. */}
        {dados.emUnissono && (
          <Linha
            icone="people-outline"
            etiqueta="Everyone landed on this"
            titulo={dados.emUnissono.titulo}
            nota={`${dados.emUnissono.artista ? `${dados.emUnissono.artista} · ` : ''}${dados.emUnissono.pessoas} of you, no one planned it`}
            capa={dados.emUnissono.capa}
            cor={tema.color}
          />
        )}

        {dados.partilhou && dados.partilhou.quantas > 0 && (
          <Linha
            icone="paper-plane-outline"
            etiqueta="Shared the most"
            titulo={nome(dados.partilhou)}
            nota={`${dados.partilhou.quantas} ${dados.partilhou.quantas === 1 ? 'song' : 'songs'} sent`}
            avatar={dados.partilhou.avatar}
            avatarNome={nome(dados.partilhou)}
            cor={tema.color}
          />
        )}

        <PillButton label="Nice" onPress={() => setAberto(false)} />
      </View>
    </BottomSheet>
  );
}

function Linha({ icone, etiqueta, titulo, nota, capa, avatar, avatarNome, cor }: {
  icone: keyof typeof Ionicons.glyphMap;
  etiqueta: string;
  titulo: string;
  nota: string;
  capa?: string | null;
  avatar?: string | null;
  avatarNome?: string;
  cor: string;
}) {
  return (
    <View style={styles.linha}>
      {avatarNome ? (
        <FriendAvatar avatarUrl={avatar ?? null} name={avatarNome} size={40} />
      ) : capa ? (
        <Image source={{ uri: capa }} style={styles.capa} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.capa, styles.capaVazia]}>
          <Ionicons name={icone} size={18} color={cor} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={styles.etiqueta}>{etiqueta.toUpperCase()}</Text>
        <Text numberOfLines={1} style={[type.body, { fontWeight: '600' }]}>{titulo}</Text>
        <Text numberOfLines={1} style={type.caption}>{nota}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cabeca: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: 1,
  },
  titulo: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitulo: { fontSize: 13, fontWeight: '600', opacity: 0.8 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  capa: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.surfaceHigh },
  capaVazia: { alignItems: 'center', justifyContent: 'center' },
  etiqueta: { ...type.caption, fontSize: 10, letterSpacing: 0.8, color: colors.textTertiary },
});
