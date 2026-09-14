import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  checkForUpdate,
  dismissUpdate,
  PORTFOLIO_URL,
  SIDELOADLY_URL,
  type UpdateInfo,
} from '../lib/updates';
import {
  EVENTO_PROCURAR_ATUALIZACAO,
  resumirNotas,
  rotuloDaAtualizacao,
  type FaseDaAtualizacao,
} from '../lib/avisoDeVersao';
import { useAbertura } from '../state/abertura';
import { colors, radii, spacing, type } from '../theme';
import { BottomSheet } from './BottomSheet';
import { PillButton } from './PillButton';

/**
 * Como se instala a nova versão, que não é a mesma coisa nos dois sistemas.
 *
 * No Windows instalado há o "Update now" (electron/atualizacao.cjs). Numa build
 * sem a ponte (o browser), fica o site. No iOS a app não vem de loja nenhuma: o
 * Sideloadly corre no computador e instala o IPA no iPhone.
 */
const COMO_ATUALIZAR: Record<'ios' | 'windows' | 'windows-na-app', string[]> = {
  ios: [
    'Open Sideloadly on your Mac or PC.',
    'Download the new Duotone IPA and install it on your iPhone.',
  ],
  windows: [
    'Open the site and download Duotone.',
    'Run the installer.',
  ],
  'windows-na-app': [
    'Press Update now. Duotone downloads the new version.',
    'Duotone closes, installs it and opens again by itself.',
  ],
};

/**
 * Aviso de nova versão disponível.
 *
 * Só aparece na plataforma onde a versão saiu de facto — o versions.json
 * tem entradas separadas para iOS e Windows, e cada build só lê a sua.
 */
export function UpdateSheet() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  // Fechado por omissão: quem já sabe atualizar não quer o passo a passo
  // à frente das notas de versão todas as vezes.
  const [ajuda, setAjuda] = useState(false);
  const [fase, setFase] = useState<FaseDaAtualizacao>('parada');
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState('');
  // A resposta pode chegar a meio da abertura; o aviso espera que ela saia.
  const tapado = useAbertura((s) => s.aFrente);
  const ponte = Platform.OS === 'web' && typeof window !== 'undefined' ? window.duotoneDesktop : undefined;
  const instalaNaApp = update?.platform === 'windows' && !!ponte?.instalarAtualizacao;
  const ocupada = fase === 'a-descarregar' || fase === 'a-instalar';

  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((info) => {
      if (!cancelled) setUpdate(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // O "Check for updates" das Definições do PC traz o aviso de volta, mesmo
  // para uma versão a que já se disse "Not now": ali foi um pedido explícito.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const procurar = () => {
      void checkForUpdate({ ignorarDispensa: true }).then((info) => { if (info) setUpdate(info); });
    };
    window.addEventListener(EVENTO_PROCURAR_ATUALIZACAO, procurar);
    return () => window.removeEventListener(EVENTO_PROCURAR_ATUALIZACAO, procurar);
  }, []);

  useEffect(() => ponte?.onProgressoDaAtualizacao?.(setProgresso), [ponte]);

  if (!update || tapado) return null;

  // A descarregar ou a instalar não se fecha: a app vai fechar-se sozinha.
  const close = () => { if (!ocupada) setUpdate(null); };

  const later = () => {
    if (ocupada) return;
    // Não volta a insistir nesta versão — mas volta a avisar na próxima.
    void dismissUpdate(update.platform, update.latest);
    close();
  };

  const open = () => {
    void Linking.openURL(update.platform === 'ios' ? SIDELOADLY_URL : PORTFOLIO_URL);
    close();
  };

  const instalar = async () => {
    if (!ponte?.instalarAtualizacao || ocupada) return;
    setErro('');
    setProgresso(0);
    setFase('a-descarregar');
    try {
      const resultado = await ponte.instalarAtualizacao();
      if (resultado?.ok) {
        setFase('a-instalar');
      } else {
        setFase('falhou');
        setErro(resultado?.erro || 'Could not update. Try again, or download it from the site.');
      }
    } catch {
      setFase('falhou');
      setErro('Could not update. Try again, or download it from the site.');
    }
  };

  const lines = resumirNotas(update.notes);
  const passos = COMO_ATUALIZAR[update.platform === 'ios' ? 'ios' : instalaNaApp ? 'windows-na-app' : 'windows'];

  return (
    <BottomSheet visible onClose={close}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={type.micro}>
            {update.platform === 'ios' ? 'iOS' : 'Windows'} · {update.current} → {update.latest}
          </Text>
          <Text style={[type.title, { marginTop: spacing.sm, marginBottom: 6 }]}>
            New version available
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ajuda ? 'Hide update instructions' : 'How do I update?'}
          accessibilityState={{ expanded: ajuda }}
          hitSlop={10}
          onPress={() => setAjuda((a) => !a)}
          style={({ pressed }: any) => [{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: ajuda ? colors.surfaceHigh : 'transparent',
            borderWidth: 1,
            borderColor: ajuda ? colors.borderStrong : colors.border,
            opacity: pressed ? 0.6 : 1,
          }]}
        >
          <Ionicons
            name="help"
            size={17}
            color={ajuda ? colors.text : colors.textSecondary}
          />
        </Pressable>
      </View>

      {ajuda && (
        <View style={{
          backgroundColor: colors.surfaceHigh,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.md,
          gap: 6,
          marginBottom: spacing.sm,
        }}>
          <Text style={[type.micro, { marginBottom: 2 }]}>HOW TO UPDATE</Text>
          {passos.map((passo, i) => (
            <Text key={i} style={[type.caption, { lineHeight: 19 }]}>
              <Text style={{ color: colors.accent }}>{i + 1}. </Text>
              {passo}
            </Text>
          ))}
        </View>
      )}

      {lines.length > 0 && (
        <View style={{ gap: 4, marginBottom: spacing.sm }}>
          {lines.map((line, i) => (
            <Text key={i} style={[type.caption, { lineHeight: 19 }]}>
              <Text style={{ color: colors.accent }}>— </Text>
              {line}
            </Text>
          ))}
        </View>
      )}

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {instalaNaApp ? (
          <>
            {!!erro && <Text style={[type.caption, { color: colors.danger }]}>{erro}</Text>}
            <PillButton label={rotuloDaAtualizacao(fase, progresso)} variant="primary" onPress={() => void instalar()} />
            {fase === 'falhou' && <PillButton label="Open the site" variant="ghost" onPress={open} />}
            {!ocupada && <PillButton label="Not now" variant="ghost" onPress={later} />}
          </>
        ) : (
          <>
            <PillButton label={update.platform === 'ios' ? 'Open Sideloadly' : 'Open the site'} variant="primary" onPress={open} />
            <PillButton label="Not now" variant="ghost" onPress={later} />
          </>
        )}
      </View>
    </BottomSheet>
  );
}
