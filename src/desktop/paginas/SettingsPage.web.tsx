/**
 * Definições do desktop, e as linhas de que é feita.
 *
 * Regra desta página, que já custou seis opções mortas: **uma opção que não
 * faz nada é pior do que não existir.** Antes de acrescentar uma, verificar
 * que ALGUÉM a lê fora deste ecrã.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { ReactNode, useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_VERSION, BUILD_ID } from '../../lib/buildInfo';
import { historico, limparHistorico, relatorio, resumo, rotulo as rotuloDaFalha } from '../../lib/playbackDiagnostics';
import {
  getGlitchMode, setGlitchMode, type GlitchMode,
  getEffectIntensity, setEffectIntensity, type EffectIntensity,
  getShowRewindButton, getShowTrackDuration,
  setShowRewindButton, setShowTrackDuration, setShowTrackDurationCache,
  setAutoplayRadio as persistAutoplayRadio,
} from '../../lib/prefs';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../state/auth';
import { usePlayer } from '../../state/player';
import { useTheme } from '../../state/theme';
import { styles } from '../estilos.web';
import { COR, ESP } from '../tokens.web';
import { Button, ContentScroll, desktop, Dialog, Page } from '../ui.web';
import { BarraVelocidade } from '../BarraVelocidade.web';
import { newerVersion } from './comum.web';

export function SettingsPage({ notify }: { notify: (s: string) => void }) {
  const [duration, setDurationState] = useState(true);
  const [rewind, setRewindState] = useState(false);
   const [opacity, setOpacity] = useState('0.72');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // O historico de falhas vive num anel de modulo, fora do React. Este contador
  // existe so para o ecra se redesenhar depois de o limpar.
  const [, setLimpezas] = useState(0);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(null);

  const [glitch, setGlitch] = useState<GlitchMode>('reactive');
  const [effectIntensity, setEffectIntensityState] = useState<EffectIntensity>('normal');

  const themeName = useTheme((s) => s.themeName);
  const setTheme = useTheme((s) => s.setTheme);
  const playbackRate = usePlayer((s) => s.playbackRate);
  const setPlaybackRate = usePlayer((s) => s.setPlaybackRate);
  // Vem já carregado da store (App.tsx lê a preferência no arranque nas duas
  // plataformas), por isso não precisa de entrar no Promise.all acima.
  const autoplayRadio = usePlayer((s) => s.autoplayRadio);
  // A store e o ticker de 1s do App.tsx ja corriam no desktop; faltava so a UI.
  const sleepLeft = usePlayer((s) => s.sleepTimerTimeLeft);
  const sleepChoice = sleepLeft === 0 ? '0'
    : sleepLeft <= 15 * 60 ? '15'
    : sleepLeft <= 30 * 60 ? '30'
    : sleepLeft <= 45 * 60 ? '45' : '60';

  useEffect(() => {
    Promise.all([
      getShowTrackDuration(),
      getShowRewindButton(),
      AsyncStorage.getItem('pref:panelOpacity'),
      getGlitchMode(),
      getEffectIntensity(),
    ]).then(([a, b, opacityVal, modoGlitch, intensidade]) => {
      setDurationState(a);
      setRewindState(b);
      if (opacityVal) setOpacity(opacityVal);
      setGlitch(modoGlitch);
      setEffectIntensityState(intensidade);
    });
  }, []);

  const changeOpacity = async (val: string) => {
    setOpacity(val);
    await AsyncStorage.setItem('pref:panelOpacity', val);
    window.dispatchEvent(new CustomEvent('duotone:panel-opacity', { detail: val }));
  };

  const changeGlitch = async (val: string) => {
    const modo = val as GlitchMode;
    setGlitch(modo);
    await setGlitchMode(modo);
    window.dispatchEvent(new CustomEvent('duotone:glitch-mode', { detail: modo }));
  };

  const changeEffectIntensity = async (val: string) => {
    const intensidade = val as EffectIntensity;
    setEffectIntensityState(intensidade);
    await setEffectIntensity(intensidade);
    window.dispatchEvent(new CustomEvent('duotone:effect-intensity', { detail: intensidade }));
  };

  // Diagnostico de reproducao. O detalhe tecnico (cliente InnerTube, PO Token,
  // codigo do embed, HTTP) deixou de ir para a barra do leitor e passou a
  // viver aqui — que e onde serve para alguma coisa: um ficheiro que se abre,
  // se le e se cola numa mensagem. Antes disto ia tudo para `console.warn`,
  // que num executavel instalado nao e lido por ninguem.
  const falhas = historico();
  const exportarRelatorio = () => {
    const texto = relatorio({
      versao: APP_VERSION,
      build: BUILD_ID,
      plataforma: `windows (${navigator.userAgent.includes('Electron') ? 'app' : 'browser'})`,
      gerado: new Date().toISOString(),
    });
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `duotone-reproducao-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revogar so depois do clique: revogar antes cancela a propria transferencia.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(falhas.length ? 'Playback report saved.' : 'No failures this session — empty report saved.');
  };

  const runDeleteAccount = async () => {
    try {
      const { error } = await supabase.rpc('delete_user_account');
      if (error) throw error;
      setDeleteConfirm(false);
      notify('Your account has been deleted.');
      useAuth.getState().signOut();
    } catch (e: any) {
      notify(e?.message || 'Could not delete your account.');
    }
  };

  const checkForUpdates = async () => {
    if (update) {
      window.open(update.url, '_blank', 'noopener,noreferrer');
      return;
    }

    setCheckingUpdate(true);
    try {
      const response = await fetch('https://api.github.com/repos/joaoafonso2004/duotone/releases/latest', {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (response.status === 404) {
        notify('No published Windows update is available yet.');
        return;
      }
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

      const release = await response.json();
      const version = String(release.tag_name || '').replace(/^v/i, '');
      const asset = Array.isArray(release.assets)
        ? release.assets.find((item: any) => /Duotone.*Setup.*\.exe$/i.test(String(item.name || '')))
        : null;
      const url = String(asset?.browser_download_url || release.html_url || '');
      const trustedUrl = url.startsWith('https://github.com/joaoafonso2004/duotone/');

      if (newerVersion(version, APP_VERSION) && trustedUrl) {
        setUpdate({ version, url });
        notify(`Duotone ${version} is available.`);
      } else {
        notify(`Duotone ${APP_VERSION} is up to date.`);
      }
    } catch {
      notify('Could not check for updates. Check your connection and try again.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <Page title="Settings" subtitle="Desktop playback, appearance, and account preferences.">
      <ContentScroll>
        <View style={styles.settingsGrid}>
          <SettingsCard icon="play-circle-outline" title="Playback">
            <ToggleLine label="Show track duration" description="Display a time column in track lists." value={duration} onChange={(v) => { setDurationState(v); setShowTrackDuration(v); setShowTrackDurationCache(v); }} />
            <ToggleLine label="Autoplay radio" description="When the queue ends, keep playing similar music instead of stopping." value={autoplayRadio} onChange={(v) => { usePlayer.getState().setAutoplayRadio(v); persistAutoplayRadio(v); }} />
            <ToggleLine label="15-second rewind" description="Show a rewind control in the desktop player." value={rewind} onChange={(v) => { setRewindState(v); setShowRewindButton(v); usePlayer.getState().setShowRewindButton(v); }} />
            <ChoiceLine label="Sleep timer" value={sleepChoice} choices={[['0', 'Off'], ['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '60 min']]} onChange={(v) => usePlayer.getState().setSleepTimer(Number(v))} />
            {/* Era um controlo de tres posicoes; passa a barra continua, de
                0,25 a 2 em degraus de 0,1. O 0,25 e o minimo REAL: o IFrame
                prende ai qualquer pedido mais baixo. */}
            <View style={styles.settingLine}>
              <View style={{ flex: 1, paddingRight: ESP.lg }}>
                <Text style={styles.settingLabel}>Playback speed</Text>
                <Text style={styles.settingDescription}>The default for tracks you have not set individually. Pitch follows the speed, so slowing down sounds slowed.</Text>
              </View>
              <View style={{ width: 260 }}>
                <BarraVelocidade valor={playbackRate} aoMudar={(v) => setPlaybackRate(v, true)} />
              </View>
            </View>
          </SettingsCard>
          
          <SettingsCard icon="desktop-outline" title="Appearance & Visuals">
            {/* A captura de audio e dita aqui, nao escondida: e o que permite
                o efeito reagir ao som, e desligar a opcao desliga-a mesmo. */}
            <ChoiceLine label="Effect intensity" description="Adjust the visual strength without changing beat detection." value={effectIntensity} choices={[['subtle', 'Subtle'], ['normal', 'Normal'], ['strong', 'Strong']]} onChange={changeEffectIntensity} />
            <ChoiceLine label="Effect mode" description="Reactive follows the music. Static freezes the selected style. Off shows the plain artwork and stops audio capture." value={glitch} choices={[['reactive', 'Reactive'], ['static', 'Static'], ['off', 'Off']]} onChange={changeGlitch} />
            <ChoiceLine label="Accent Theme" value={themeName} choices={[['violet', 'Violet'], ['blue', 'Blue'], ['orange', 'Orange'], ['green', 'Green'], ['pink', 'Pink'], ['red', 'Red'], ['mono', 'White'], ['steel', 'Steel']]} onChange={(v) => setTheme(v as any)} />
            <ChoiceLine label="Glass Transparency" value={opacity} choices={[['0.95', 'Solid'], ['0.72', 'Default'], ['0.55', 'Translucent'], ['0.35', 'Neon blur']]} onChange={changeOpacity} />
          </SettingsCard>

          <SettingsCard icon="pulse-outline" title="Playback diagnostics">
            <SettingLine
              label="Failures this session"
              value={falhas.length
                ? `${falhas.length} — ${Object.entries(resumo(falhas)).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n}× ${rotuloDaFalha(t as any)}`).join(', ')}`
                : 'None'}
            />
            <SettingAction label="Export playback report" onPress={exportarRelatorio} />
            {falhas.length > 0 && (
              <SettingAction label="Clear recorded failures" onPress={() => { limparHistorico(); notify('Cleared.'); setLimpezas((n) => n + 1); }} />
            )}
          </SettingsCard>

          <SettingsCard icon="information-circle-outline" title="About">
            <SettingLine label="Application" value="Duotone for Windows" />
            {/* Vem do buildInfo.ts, que a CI reescreve a cada build (build-windows.yml).
                Escrito à mão ficava preso no 1.0.0 mesmo em builds mais recentes. */}
            <SettingLine label="Version" value={APP_VERSION} />
            <SettingLine label="Build" value={BUILD_ID} />
            <SettingAction
              label={update ? `Download Duotone ${update.version}` : checkingUpdate ? 'Checking for updates…' : 'Check for updates'}
              onPress={() => { if (!checkingUpdate) void checkForUpdates(); }}
            />
            <SettingAction danger label="Delete account permanently" onPress={() => setDeleteConfirm(true)} />
          </SettingsCard>
        </View>
      </ContentScroll>
      <Dialog open={deleteConfirm} title="Delete account permanently?" onClose={() => setDeleteConfirm(false)}>
        <Text style={styles.dialogBody}>Your account and all profile data will be permanently deleted. This cannot be undone.</Text>
        <View style={styles.dialogActions}>
          <Button secondary onPress={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button danger onPress={runDeleteAccount}>Delete Account</Button>
        </View>
      </Dialog>
    </Page>
  );
}

export function SettingsCard({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: ReactNode }) { return <View style={styles.settingsCard}><View style={styles.settingsCardTitle}><Ionicons name={icon} size={19} color={desktop.accent} /><Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>; }

export function SettingLine({ label, value }: { label: string; value: string }) { return <View style={styles.settingLine}><Text style={styles.settingLabel}>{label}</Text><Text numberOfLines={1} style={styles.settingValue}>{value}</Text></View>; }

export function SettingAction({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) { return <Pressable onPress={onPress} style={({ hovered }) => [styles.settingLine, hovered && styles.settingHover]}><Text style={[styles.settingLabel, danger && { color: desktop.danger }]}>{label}</Text><Ionicons name="chevron-forward" size={15} color={desktop.dim} /></Pressable>; }

export function ToggleLine({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) { return <View style={styles.settingLine}><View style={{ flex: 1 }}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingDescription}>{description}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: COR.elevado, true: COR.metalClaro }} thumbColor={COR.fundo} /></View>; }

export function ChoiceLine({ label, description, value, choices, onChange }: { label: string; description?: string; value: string; choices: [string, string][]; onChange: (v: string) => void }) { return <View style={[styles.settingLine, { alignItems: 'flex-start' }]}><View style={{ flex: 1, marginTop: 8, paddingRight: ESP.md }}><Text style={styles.settingLabel}>{label}</Text>{description ? <Text style={styles.settingDescription}>{description}</Text> : null}</View><View style={styles.smallSegment}>{choices.map(([id, text]) => <Pressable key={id} onPress={() => onChange(id)} style={[styles.smallSegmentItem, value === id && styles.smallSegmentActive]}><Text style={[styles.smallSegmentText, value === id && { color: desktop.text }]}>{text}</Text></Pressable>)}</View></View>; }
