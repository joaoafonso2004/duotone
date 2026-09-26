import { RecommendationPreferences } from '../../components/RecommendationPreferences';
import { removeOwnProfileMedia } from '../../lib/profileMedia';
/**
 * Definições do desktop, e as linhas de que é feita.
 *
 * Regra desta página, que já custou seis opções mortas: **uma opção que não
 * faz nada é pior do que não existir.** Antes de acrescentar uma, verificar
 * que ALGUÉM a lê fora deste ecrã.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_VERSION, BUILD_ID } from '../../lib/buildInfo';
import { EVENTO_PROCURAR_ATUALIZACAO } from '../../lib/avisoDeVersao';
import { checkForUpdate, PORTFOLIO_URL } from '../../lib/updates';
import { relatorio } from '../../lib/playbackDiagnostics';
import {
  getGlitchMode, setGlitchMode, type GlitchMode,
  getEffectIntensity, setEffectIntensity, type EffectIntensity,
  getShowRewindButton, getShowTrackDuration,
  setShowRewindButton, setShowTrackDuration, setShowTrackDurationCache,
  setAutoplayRadio as persistAutoplayRadio,
  getNotificationsEnabled, setNotificationsEnabled,
} from '../../lib/prefs';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../state/auth';
import { usePlayer } from '../../state/player';
import { useTheme } from '../../state/theme';
import { styles } from '../estilos.web';
import { COR, ESP } from '../tokens.web';
import { Button, ContentScroll, desktop, Dialog, Field, Page } from '../ui.web';
import { BarraVelocidade } from '../BarraVelocidade.web';
import { AtalhosDoTeclado } from '../AtalhosDoTeclado.web';
import { BandasDoEqualizador, ReporEqualizador } from '../PainelEqualizador.web';
import { chaveDaFaixa, PLANO } from '../../lib/equalizer';
import { getCorNaJanela, getDiscordRichPresence, setCorNaJanela, setCrossfadeSegundos, setDiscordRichPresence, setIntensidadeDoSmartShuffle, type CorDoLeitor } from '../../lib/prefs';
import { DURACOES_DO_CROSSFADE, type DuracaoDoCrossfade } from '../../lib/crossfade';
import { efeitoDoCrossfade, efeitoDoDiscord, efeitoDoPadrao, efeitoDoRadio, efeitoDoSmartShuffle, efeitoDoTemporizador } from '../../lib/efeitoDasDefinicoes';
import { useEstadoDoDiscord } from '../../hooks/usePresencaDoDiscord';
import { usePrivacidade } from '../../state/privacidade';
import { getLibrary } from '../../api/library';
import { resumoDoVarrimento, varrerCatalogo } from '../../state/catalogoDeFaixas';
import { useConnectivity } from '../../state/connectivity';
import type { NavegarFn } from '../rotas';

export function SettingsPage({ notify, navigate }: { notify: (s: string) => void; navigate: NavegarFn }) {
  const [recommendationsOpen,setRecommendationsOpen]=useState(false);
  // Identificar a biblioteca contra um catálogo a sério, como no iPhone. Só
  // corre quando se pede: são uma ou duas chamadas de rede por faixa.
  const offline = useConnectivity((s) => s.offline);
  const [aIdentificar, setAIdentificar] = useState(false);
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null);
  const [resumoDoCatalogo, setResumoDoCatalogo] = useState<string | null>(null);
  const pararIdentificacao = useRef(false);
  const identificarBiblioteca = async () => {
    setAIdentificar(true);
    setResumoDoCatalogo(null);
    pararIdentificacao.current = false;
    try {
      const r = await varrerCatalogo(
        await getLibrary(),
        (feitas, total) => setProgresso(total ? { feitas, total } : null),
        () => pararIdentificacao.current,
      );
      setResumoDoCatalogo(resumoDoVarrimento(r));
    } catch {
      setResumoDoCatalogo('Could not finish. Check your connection and try again.');
    } finally {
      setProgresso(null);
      setAIdentificar(false);
    }
  };
  const [notifications, setNotifications] = useState(true);
  const [startup, setStartup] = useState<{ enabled: boolean; mode: 'window' | 'tray'; available: boolean } | null>(null);
  const [savingStartup, setSavingStartup] = useState(false);
  const [closeToTray, setCloseToTray] = useState(true);
  useEffect(() => {
    void getNotificationsEnabled().then(setNotifications);
    void window.duotoneDesktop?.getStartup?.().then(setStartup).catch(() => {});
    void window.duotoneDesktop?.getCloseToTray?.().then(setCloseToTray).catch(() => {});
  }, []);
  const changeStartup = async (enabled: boolean, mode: 'window' | 'tray') => {
    if (savingStartup || !window.duotoneDesktop?.setStartup) return;
    setSavingStartup(true);
    try { setStartup(await window.duotoneDesktop.setStartup(enabled, mode)); }
    catch (e: any) { notify(e?.message || 'Could not change Windows startup.'); }
    finally { setSavingStartup(false); }
  };
  const changeCloseToTray = async (enabled: boolean) => {
    const anterior = closeToTray;
    setCloseToTray(enabled);
    try { await window.duotoneDesktop?.setCloseToTray?.(enabled); }
    catch (e: any) {
      setCloseToTray(anterior);
      notify(e?.message || 'Could not change the Close button behaviour.');
    }
  };
  const [duration, setDurationState] = useState(true);
  const [rewind, setRewindState] = useState(false);
   const [opacity, setOpacity] = useState('0.72');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [seccao, setSeccao] = useState<IdDaSeccao>(seccaoAberta);
  const [estreita, setEstreita] = useState(false);
  const [corDoLeitor, setCorDoLeitorState] = useState<CorDoLeitor>('janela');
  useEffect(() => { void getCorNaJanela().then(setCorDoLeitorState); }, []);
  const mudarCorDoLeitor = (v: string) => {
    const cor = v === 'pagina' ? 'pagina' : 'janela';
    setCorDoLeitorState(cor);
    void setCorNaJanela(cor);
    window.dispatchEvent(new CustomEvent('duotone:cor-na-janela', { detail: cor }));
  };
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [update, setUpdate] = useState<{ version: string } | null>(null);

  const [glitch, setGlitch] = useState<GlitchMode>('reactive');
  const [effectIntensity, setEffectIntensityState] = useState<EffectIntensity>('normal');

  const modo = useTheme((s) => s.mode);
  const setMode = useTheme((s) => s.setMode);
  // O padrao, e nao a velocidade da faixa a tocar: e isso que este controlo
  // define, e mostrar a outra fazia a barra saltar a cada mudanca de musica.
  const padraoRate = usePlayer((s) => s.padraoRate);
  const [discordOn,setDiscordOn]=useState(false);
  useEffect(()=>{void getDiscordRichPresence().then(setDiscordOn);},[]);
  /** A casca e outra arvore: o aviso passa por evento, como o glitch. */
  const avisarDiscord=(on:boolean)=>
    window.dispatchEvent(new CustomEvent('duotone:discord',{detail:{on}}));
  const padraoGanhos = usePlayer((s) => s.padraoGanhos);
  const setEqGanhos = usePlayer((s) => s.setEqGanhos);
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

  // O que cada opção está a fazer agora -- as frases vivem em
  // lib/efeitoDasDefinicoes.ts, as mesmas do iPhone.
  const atual = usePlayer((s) => s.current);
  const rateDaFaixa = usePlayer((s) => s.playbackRate);
  const ganhosDaFaixa = usePlayer((s) => s.eqGanhos);
  const ajusteDaFaixa = usePlayer((s) => (s.current ? s.ajustesPorFaixa[chaveDaFaixa(s.current)] : undefined));
  const radioActivo = usePlayer((s) => s.radioActive);
  const crossfade = usePlayer((s) => s.crossfadeSegundos);
  const repeatUma = usePlayer((s) => s.repeatMode === 'one');
  const intensidadeSmart = usePlayer((s) => s.intensidadeSmartShuffle);
  const smartLigado = usePlayer((s) => s.shuffle && s.shuffleInteligente);
  const estadoDoDiscord = useEstadoDoDiscord((s) => s.estado);
  const privada = usePrivacidade((s) => s.privada);
  const efeitos = {
    smart: efeitoDoSmartShuffle({ intensidade: intensidadeSmart, ligado: smartLigado }),
    discord: efeitoDoDiscord({ ligado: discordOn, privada, estado: estadoDoDiscord }),
    radio: efeitoDoRadio({ ligado: autoplayRadio, aTocarRadio: radioActivo }),
    temporizador: efeitoDoTemporizador({ restanteS: sleepLeft, agora: new Date() }),
    crossfade: efeitoDoCrossfade({ segundos: crossfade, repeatUma }),
    velocidade: efeitoDoPadrao({
      tipo: 'velocidade', temFaixa: !!atual,
      temAjusteProprio: !!ajusteDaFaixa && ajusteDaFaixa.rate !== null,
      igualAoPadrao: Math.abs(rateDaFaixa - padraoRate) < 0.005,
      valorDaFaixa: `${Number(rateDaFaixa.toFixed(2))}×`,
    }),
    equalizador: efeitoDoPadrao({
      tipo: 'equalizador', temFaixa: !!atual,
      temAjusteProprio: !!ajusteDaFaixa && ajusteDaFaixa.ganhos !== null,
      igualAoPadrao: ganhosDaFaixa.length === padraoGanhos.length
        && ganhosDaFaixa.every((g, i) => Math.abs(g - padraoGanhos[i]) < 0.05),
    }),
  };

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
    notify('Playback report saved.');
  };

  const runDeleteAccount = async () => {
    try {
      await removeOwnProfileMedia();
      const { error } = await supabase.rpc('delete_user_account');
      if (error) throw error;
      setDeleteConfirm(false);
      notify('Your account has been deleted.');
      useAuth.getState().signOut();
    } catch (e: any) {
      notify(e?.message || 'Could not delete your account.');
    }
  };

  // Na app instalada, o aviso de versão instala sozinho ("Update now"); no
  // browser não há ponte, e fica o download pelo site.
  const instalaNaApp = typeof window !== 'undefined' && !!window.duotoneDesktop?.instalarAtualizacao;
  const checkForUpdates = async () => {
    if (!instalaNaApp) {
      window.open(PORTFOLIO_URL, '_blank', 'noopener,noreferrer');
      return;
    }
    if (update) {
      window.dispatchEvent(new CustomEvent(EVENTO_PROCURAR_ATUALIZACAO));
      return;
    }

    setCheckingUpdate(true);
    try {
      const release = await checkForUpdate({ ignorarDispensa: true, atirarErro: true });
      if (release?.platform === 'windows') {
        setUpdate({ version: release.latest });
        notify(`Duotone ${release.latest} is available.`);
        window.dispatchEvent(new CustomEvent(EVENTO_PROCURAR_ATUALIZACAO));
      } else {
        notify(`Duotone ${APP_VERSION} is up to date.`);
      }
    } catch {
      notify('Could not check for updates. Check your connection and try again.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  // Arrumadas a 26/9 (pedido do João): as cartas empilhadas à esquerda, com
  // metade do ecrã vazio à direita, davam uma página comprida e sem ordem.
  // Agora é uma coluna ao centro, com as secções à esquerda dela e UMA secção
  // de cada vez à direita. Saíram o "Build", o "Application", a contagem de
  // falhas e o "Clear recorded failures" (coisas de quem mantém a app); o
  // relatório ficou, numa linha do About.
  const temWindows = !!window.duotoneDesktop?.notifyMessage;
  const temAtalhos = !!window.duotoneDesktop?.lerAtalhos;
  const seccoes = SECCOES.filter((s) => (s.id !== 'windows' || temWindows) && (s.id !== 'atalhos' || temAtalhos));
  const aberta = seccoes.some((s) => s.id === seccao) ? seccao : 'reproducao';
  const escolher = (id: IdDaSeccao) => { seccaoAberta = id; setSeccao(id); };

  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <RecommendationPreferences visible={recommendationsOpen} onClose={()=>setRecommendationsOpen(false)}/>
      <ContentScroll>
        <View style={styles.definicoes} onLayout={(e) => { const w = e.nativeEvent.layout.width; setEstreita((antes) => (w < 820) !== antes ? w < 820 : antes); }}>
          <Text style={styles.definicoesTitulo}>Settings</Text>
          {/* Numa janela estreita o índice passa para cima, em linha: ao lado
              deixava o painel com duzentos e poucos píxeis. */}
          <View style={[styles.definicoesCorpo, estreita && { flexDirection: 'column', alignItems: 'stretch', gap: ESP.lg }]}>
            <View style={[styles.definicoesIndice, estreita && styles.definicoesIndiceEmLinha]}>
              {seccoes.map((s) => (
                <Pressable key={s.id} onPress={() => escolher(s.id)} accessibilityRole="tab" accessibilityState={{ selected: aberta === s.id }}
                  style={({ hovered }: any) => [styles.definicoesItem, hovered && styles.definicoesItemHover, aberta === s.id && styles.definicoesItemAtivo]}>
                  <Ionicons name={s.icone} size={17} color={aberta === s.id ? COR.texto : desktop.dim} />
                  <Text style={[styles.definicoesItemTexto, aberta === s.id && { color: COR.texto }]}>{s.nome}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.definicoesPainel}>
              {aberta === 'reproducao' && <SettingsCard title="Playback">
                {/* Quantas músicas novas o Smart Shuffle mete (26/9). */}
                <ChoiceLine label="Smart shuffle" description="How many new songs it adds to what you're playing."
                  value={intensidadeSmart} choices={[['poucas', 'Few'], ['normal', 'Some'], ['muitas', 'Lots']]}
                  onChange={(v) => { const i = v as 'poucas' | 'normal' | 'muitas'; usePlayer.setState({ intensidadeSmartShuffle: i }); void setIntensidadeDoSmartShuffle(i); }}
                  efeito={efeitos.smart} />
                {/* O crossfade do PC (24/9): um segundo player do YouTube prepara a
                    seguinte, calado, e os volumes cruzam-se no fim -- ver o
                    YouTubePlayerView.web.tsx. Desligado de origem, como no iPhone. */}
                <ChoiceLine label="Crossfade" description="Blend the end of a song into the next one."
                  value={String(crossfade)} choices={DURACOES_DO_CROSSFADE.map((d) => [String(d), d === 0 ? 'Off' : `${d} s`] as [string, string])}
                  onChange={(v) => { const d = Number(v) as DuracaoDoCrossfade; usePlayer.setState({ crossfadeSegundos: d }); void setCrossfadeSegundos(d); }}
                  efeito={efeitos.crossfade} />
                <ToggleLine label="Autoplay similar music" description="When the queue ends, keep playing music like it instead of stopping." value={autoplayRadio} onChange={(v) => { usePlayer.getState().setAutoplayRadio(v); persistAutoplayRadio(v); }} efeito={efeitos.radio} />
                <ChoiceLine label="Sleep timer" value={sleepChoice} choices={[['0', 'Off'], ['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '60 min']]} onChange={(v) => usePlayer.getState().setSleepTimer(Number(v))} efeito={efeitos.temporizador} />
                <View style={[styles.settingLine, { flexDirection: 'column', alignItems: 'stretch', gap: ESP.md }]}>
                  <View>
                    <Text style={styles.settingLabel}>Playback speed</Text>
                    <Text style={styles.settingDescription}>For songs you haven't set on their own. Pitch follows the speed, so slower sounds slowed.</Text>
                    <Efeito texto={efeitos.velocidade} />
                  </View>
                  <BarraVelocidade valor={padraoRate} aoMudar={(v) => setPlaybackRate(v, true)} />
                </View>
              </SettingsCard>}

              {/* O equalizador base: vale para as faixas que não tenham o seu, e
                  não mexe na que está a tocar. As mesmas bandas do Now Playing. */}
              {aberta === 'som' && <SettingsCard title="Sound">
                <View style={[styles.settingLine, { flexDirection: 'column', alignItems: 'stretch', gap: ESP.md }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1, paddingRight: ESP.lg }}>
                      <Text style={styles.settingLabel}>Equaliser</Text>
                      <Text style={styles.settingDescription}>For songs you haven't set on their own. The one playing changes on the next song.</Text>
                      <Efeito texto={efeitos.equalizador} />
                    </View>
                    <ReporEqualizador aoRepor={() => setEqGanhos(PLANO.slice(), true)} />
                  </View>
                  <BandasDoEqualizador ganhos={padraoGanhos} aoMudarGanhos={(g) => setEqGanhos(g, true)} />
                </View>
              </SettingsCard>}

              {aberta === 'aspeto' && <SettingsCard title="Appearance">
                {/* A captura de audio e dita aqui, nao escondida: e o que permite
                    o efeito reagir ao som, e desligar a opcao desliga-a mesmo. */}
                <ChoiceLine label="Now Playing effect" description="Reactive follows the music. Static freezes it. Off shows the plain artwork." value={glitch} choices={[['reactive', 'Reactive'], ['static', 'Static'], ['off', 'Off']]} onChange={changeGlitch} />
                {glitch !== 'off' && <ChoiceLine label="Effect strength" value={effectIntensity} choices={[['subtle', 'Subtle'], ['normal', 'Normal'], ['strong', 'Strong']]} onChange={changeEffectIntensity} />}
                {/* A cor da capa a encher a janela (26/9); a de origem. */}
                <ChoiceLine label="Now Playing colour" description="Let the artwork's colour fill the whole window, or keep it inside the page." value={corDoLeitor} choices={[['janela', 'Whole window'], ['pagina', 'Page only']]} onChange={mudarCorDoLeitor} />
                <ChoiceLine label="Accent" value={modo} choices={[['steel', 'Steel'], ['cover', 'Follow the cover']]} onChange={(v) => void setMode(v as any)} />
                <ChoiceLine label="Window" value={opacity} choices={[['0.95', 'Solid'], ['0.72', 'Default'], ['0.55', 'Translucent'], ['0.35', 'Clear']]} onChange={changeOpacity} />
                <ToggleLine label="Song length in lists" description="Show a time column in track lists." value={duration} onChange={(v) => { setDurationState(v); setShowTrackDuration(v); setShowTrackDurationCache(v); }} />
                <ToggleLine label="15-second rewind" description="Show a rewind button in the player." value={rewind} onChange={(v) => { setRewindState(v); setShowRewindButton(v); usePlayer.getState().setShowRewindButton(v); }} />
              </SettingsCard>}

              {aberta === 'windows' && <SettingsCard title="Windows">
                <ToggleLine label="Message notifications" description="Show a Windows notification when a message arrives while you are away."
                  value={notifications} onChange={(v) => { setNotifications(v); void setNotificationsEnabled(v); }} />
                {window.duotoneDesktop?.setCloseToTray && <ToggleLine
                  label="Close to tray"
                  description="Keep playing in the system tray when you close the window."
                  value={closeToTray} onChange={(v) => void changeCloseToTray(v)} />}
                {startup?.available && <>
                  <ToggleLine label="Start with Windows" description="Open Duotone when you sign in to Windows."
                    value={startup.enabled} onChange={(v) => void changeStartup(v, startup.mode)} />
                  {startup.enabled && <ChoiceLine label="Start in" value={startup.mode} choices={[[ 'tray', 'System tray' ], [ 'window', 'Window' ]]}
                    onChange={(v) => void changeStartup(startup.enabled, v as 'window' | 'tray')} />}
                </>}
                {/* Desligada de origem: publica o que se ouve. A aplicação oficial
                    fica embutida; pedir um client id a cada pessoa impedia o Join,
                    porque todos os participantes têm de usar a mesma aplicação. */}
                <ToggleLine label="Discord status"
                  description="Show what you're listening to on Discord. Friends can join your Jam from there."
                  value={discordOn} onChange={(v)=>{setDiscordOn(v);void setDiscordRichPresence(v);avisarDiscord(v);}}
                  efeito={efeitos.discord} />
              </SettingsCard>}

              {aberta === 'atalhos' && <SettingsCard title="Keyboard shortcuts">
                <AtalhosDoTeclado />
              </SettingsCard>}

              {/* A biblioteca: o artista e o título vêm adivinhados do título do
                  vídeo, e um catálogo a sério corrige-os; o Library check trata
                  dos duplicados, dos vídeos que já não tocam e das capas partidas.
                  Nenhum dos dois corre sozinho. */}
              {aberta === 'biblioteca' && <SettingsCard title="Library">
                <View style={styles.settingLine}>
                  <View style={{ flex: 1, paddingRight: ESP.lg }}>
                    <Text style={styles.settingLabel}>Recommendations</Text>
                    <Text style={styles.settingDescription}>Songs you hid and artists you want to hear less often.</Text>
                  </View>
                  <Button secondary onPress={() => setRecommendationsOpen(true)}>Manage</Button>
                </View>
                <View style={styles.settingLine}>
                  <View style={{ flex: 1, paddingRight: ESP.lg }}>
                    <Text style={styles.settingLabel}>Identify library</Text>
                    <Text style={styles.settingDescription}>
                      {progresso
                        ? `Identifying ${progresso.feitas} of ${progresso.total}…`
                        : resumoDoCatalogo
                          ?? 'Fix artist names, titles and covers with a music catalogue.'}
                    </Text>
                  </View>
                  <Button secondary disabled={offline && !aIdentificar}
                    onPress={aIdentificar ? () => { pararIdentificacao.current = true; } : () => void identificarBiblioteca()}>
                    {aIdentificar ? 'Stop' : 'Identify'}
                  </Button>
                </View>
                <View style={styles.settingLine}>
                  <View style={{ flex: 1, paddingRight: ESP.lg }}>
                    <Text style={styles.settingLabel}>Library check</Text>
                    <Text style={styles.settingDescription}>Find songs saved twice, videos that no longer play and covers that don't load.</Text>
                  </View>
                  <Button secondary onPress={() => navigate({ name: 'library-check' })}>Open</Button>
                </View>
              </SettingsCard>}

              {aberta === 'sobre' && <SettingsCard title="About">
                {/* Vem do buildInfo.ts, que a CI reescreve a cada build (build-windows.yml). */}
                <SettingLine label="Version" value={APP_VERSION} />
                <SettingAction
                  label={update ? `${instalaNaApp ? 'Update to' : 'Download'} Duotone ${update.version}` : checkingUpdate ? 'Checking for updates…' : 'Check for updates'}
                  onPress={() => { if (!checkingUpdate) void checkForUpdates(); }}
                />
                <SettingAction label="Save playback report" description="If a song won't play, send this so it can be fixed." onPress={exportarRelatorio} />
                <SettingAction danger label="Delete account permanently" onPress={() => setDeleteConfirm(true)} />
              </SettingsCard>}
            </View>
          </View>
        </View>
      </ContentScroll>
      <Dialog open={deleteConfirm} title="Delete account permanently?" onClose={() => setDeleteConfirm(false)}>
        <Text style={styles.dialogBody}>Your account and all profile data will be permanently deleted. This cannot be undone.</Text>
        <View style={styles.dialogActions}>
          <Button secondary onPress={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button danger onPress={runDeleteAccount}>Delete Account</Button>
        </View>
      </Dialog>
    </View>
  );
}

type IdDaSeccao = 'reproducao' | 'som' | 'aspeto' | 'windows' | 'atalhos' | 'biblioteca' | 'sobre';
const SECCOES: { id: IdDaSeccao; nome: string; icone: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'reproducao', nome: 'Playback', icone: 'play-circle-outline' },
  { id: 'som', nome: 'Sound', icone: 'options-outline' },
  { id: 'aspeto', nome: 'Appearance', icone: 'color-palette-outline' },
  { id: 'windows', nome: 'Windows', icone: 'desktop-outline' },
  { id: 'atalhos', nome: 'Shortcuts', icone: 'keypad-outline' },
  { id: 'biblioteca', nome: 'Library', icone: 'library-outline' },
  { id: 'sobre', nome: 'About', icone: 'information-circle-outline' },
];
/** A secção aberta sobrevive a sair e voltar às Definições. */
let seccaoAberta: IdDaSeccao = 'reproducao';

export function SettingsCard({ title, children }: { icon?: keyof typeof Ionicons.glyphMap; title: string; children: ReactNode }) { return <View style={styles.settingsCard}><View style={styles.settingsCardTitle}><Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>; }

export function SettingLine({ label, value }: { label: string; value: string }) { return <View style={styles.settingLine}><Text style={[styles.settingLabel, { flex: 1 }]}>{label}</Text><Text numberOfLines={1} style={styles.settingValue}>{value}</Text></View>; }

export function SettingAction({ label, description, onPress, danger = false }: { label: string; description?: string; onPress: () => void; danger?: boolean }) { return <Pressable onPress={onPress} style={({ hovered }) => [styles.settingLine, hovered && styles.settingHover]}><View style={{ flex: 1 }}><Text style={[styles.settingLabel, danger && { color: desktop.danger }]}>{label}</Text>{description ? <Text style={styles.settingDescription}>{description}</Text> : null}</View><Ionicons name="chevron-forward" size={15} color={desktop.dim} /></Pressable>; }

/**
 * O que a opção está a fazer agora (lib/efeitoDasDefinicoes.ts), por baixo da
 * descrição: a descrição diz a regra, isto diz o momento.
 */
export function Efeito({ texto }: { texto?: string | null }) { if (!texto) return null; return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: COR.texto, opacity: 0.6 }} /><Text style={{ color: COR.texto, fontSize: 11.5, flex: 1 }}>{texto}</Text></View>; }

export function ToggleLine({ label, description, value, onChange, efeito }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void; efeito?: string | null }) { return <View style={styles.settingLine}><View style={{ flex: 1 }}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingDescription}>{description}</Text><Efeito texto={efeito} /></View><Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ false: COR.elevado, true: COR.metalClaro }} thumbColor={COR.fundo} /></View>; }

export function ChoiceLine({ label, description, value, choices, onChange, efeito }: { label: string; description?: string; value: string; choices: [string, string][]; onChange: (v: string) => void; efeito?: string | null }) { return <View style={[styles.settingLine, { alignItems: 'flex-start' }]}><View style={{ flex: 1, marginTop: 8, paddingRight: ESP.md }}><Text style={styles.settingLabel}>{label}</Text>{description ? <Text style={styles.settingDescription}>{description}</Text> : null}<Efeito texto={efeito} /></View><View style={styles.smallSegment}>{choices.map(([id, text]) => <Pressable key={id} onPress={() => onChange(id)} style={[styles.smallSegmentItem, value === id && styles.smallSegmentActive]}><Text style={[styles.smallSegmentText, value === id && { color: desktop.text }]}>{text}</Text></Pressable>)}</View></View>; }
