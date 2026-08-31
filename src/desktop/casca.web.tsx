/**
 * A casca da janela: barra de título, barra lateral e barra do leitor.
 *
 * O CSS do documento também vive aqui — as fontes são embutidas
 * (`assets/fonts`) e registadas em `@font-face`, nunca por CDN: a app tem de
 * abrir igual sem rede. E a família vai EXPLÍCITA em cada estilo de texto,
 * porque o react-native-web impõe a stack dele a cada `<Text>`.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { getInboxItems } from '../api/social';
import { YouTubePlayerView } from '../components/YouTubePlayerView';
import { AVATAR_GRADIENTS, getAvatarChoice, type AvatarChoice } from '../lib/avatarPrefs';
import { modoDeShuffle, rotuloDoModo } from '../lib/smartShuffle';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import { useTheme } from '../state/theme';
import { styles } from './estilos.web';
import { COR, FONT, FONTES } from './tokens.web';
import { Artwork, desktop, formatTime, IconButton, ui } from './ui.web';
import { PRIMARY, type Route } from './rotas';

const P = Pressable as any;
const V = View as any;

export function injectDesktopDocumentStyles() {
  if (document.getElementById('duotone-desktop-css')) return;

  // As fontes sao embutidas (assets/fonts) e registadas aqui. O `require` de
  // um asset devolve formas diferentes conforme a plataforma e a versao do
  // Metro — string, objeto com `uri`, ou modulo com `default` — por isso
  // normaliza-se em vez de assumir.
  const uri = (m: any): string =>
    typeof m === 'string' ? m : m?.uri || m?.default?.uri || m?.default || '';

  const face = (familia: string, mod: any, alcance: string) =>
    `@font-face{font-family:'${familia}';font-style:normal;font-weight:100 900;` +
    `font-display:swap;src:url(${uri(mod)}) format('woff2');unicode-range:${alcance};}`;

  const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  const LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

  const fontes = document.createElement('style');
  fontes.id = 'duotone-fonts';
  fontes.textContent = [
    face('Archivo', FONTES.archivo.latin, LATIN),
    face('Archivo', FONTES.archivo.latinExt, LATIN_EXT),
    face('Public Sans', FONTES.publicSans.latin, LATIN),
    face('Public Sans', FONTES.publicSans.latinExt, LATIN_EXT),
    face('JetBrains Mono', FONTES.jetbrainsMono.latin, LATIN),
    face('JetBrains Mono', FONTES.jetbrainsMono.latinExt, LATIN_EXT),
  ].join('');
  document.head.appendChild(fontes);

  const style = document.createElement('style');
  style.id = 'duotone-desktop-css';
  style.textContent = `
    html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;background:#060608}
    *{box-sizing:border-box}
    /* Declarar no body NAO chega: o react-native-web poe a stack dele em cada
       <Text>. Por isso os estilos usam FONT.* explicitamente (ver tokens).
       Isto so trata do que nao passa por componentes RN. */
    body{font-family:${FONT.body};-webkit-font-smoothing:antialiased}
    input,textarea,button{font-family:${FONT.body}}
    /* NAO por uma regra global aqui.
       Uma regra como '#root div, #root span' tem especificidade 2 e ganha aos
       proprios componentes — impedia os estilos de escolherem a sua fonte, e
       a sobrancelha em mono saia em Public Sans. A familia vai EXPLICITA em
       cada estilo de texto (ver TIPO em tokens.web.ts). */
    ::selection{background:rgba(233,234,238,.24)} ::-webkit-scrollbar{width:11px;height:11px}
    ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:#30303b;border:3px solid transparent;border-radius:8px;background-clip:padding-box}
    ::-webkit-scrollbar-thumb:hover{background:#494857;border:3px solid transparent;background-clip:padding-box}
    [data-focusable="true"]:focus-visible{outline:2px solid var(--accent-color, #E9EAEE)!important;outline-offset:-2px}
    .slider-container { position: relative; }
    .slider-container:hover .slider-fill { background: var(--accent-color, #E9EAEE)!important; }
    .slider-thumb {
      position: absolute;
      top: 50%;
      width: 12px;
      height: 12px;
      border-radius: 6px;
      background-color: #FFF;
      transform: translate(-50%, -50%) scale(0);
      transition: transform 0.15s cubic-bezier(0.25, 0.8, 0.25, 1);
      box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      pointer-events: none;
    }
    .slider-container:hover .slider-thumb {
      transform: translate(-50%, -50%) scale(1);
    }
    .glass-panel{backdrop-filter:blur(28px) saturate(140%);-webkit-backdrop-filter:blur(28px) saturate(140%);will-change:transform,filter;transform:translateZ(0)}
    /* O cintilar do modo inteligente.
       Em CSS e nao com o Animated do React Native: sob react-native-web o
       Animated nao mexeu nos pontos -- medido no browser, a opacidade ficava
       presa no valor inicial e forcar o valor a mao FICAVA, ou seja nao havia
       nada a animar por cima. No telemovel o Animated corre bem e e o que la
       fica; aqui manda o CSS. */
    @keyframes duotone-cintilar {
      0%, 100% { opacity: .22; }
      50%      { opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      /* Quem pediu menos movimento nao leva pontos a piscar. O seletor apanha
         qualquer elemento com este keyframe, porque o react-native-web nao
         deixa passar classes nossas. */
      *[style*="duotone-cintilar"] { animation: none !important; opacity: .5 !important; }
    }
    @keyframes pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
    .control-btn-animate {
      transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1), background-color 0.2s, opacity 0.2s!important;
      cursor: pointer;
    }
    .control-btn-animate:hover {
      transform: scale(1.1);
    }
    .control-btn-animate:active {
      transform: scale(0.93);
    }
    .btn-animate {
      transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1), background-color 0.2s, box-shadow 0.2s!important;
      cursor: pointer;
    }
    .btn-animate:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(155, 123, 255, 0.2);
    }
    .btn-animate:active {
      transform: translateY(1px) scale(0.98);
    }
    .nav-item-animate {
      transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1), background-color 0.2s, opacity 0.2s!important;
      cursor: pointer;
    }
    .nav-item-animate:hover {
      transform: translateX(4px);
    }
    .nav-item-animate:active {
      transform: scale(0.97) translateX(2px);
    }
    
    /* A fila do Now Playing e um <div> e nao um Pressable por causa do
       arrastar-para-reordenar (a API de drag do DOM nao passa pelo RNW). O
       hover fica em CSS pela mesma razao. */
    .np-fila-linha {
      border-bottom: 1px solid ${COR.linhaSuave};
      transition: background-color .18s;
    }
    .np-fila-linha:last-child { border-bottom: 0; }
    .np-fila-linha:hover { background-color: ${COR.hover}; }
    .np-fila-linha:active { cursor: grabbing; }
  `;
  document.head.appendChild(style);
  document.title = 'Duotone';
}

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const bridge = window.duotoneDesktop;
    bridge?.isMaximized().then(setMaximized);
    return bridge?.onMaximizedChange(setMaximized);
  }, []);
  return <View style={styles.titleBar as any} onDoubleClick={() => window.duotoneDesktop?.toggleMaximize()}>
    <View style={styles.titleBrand}><Image source={require('../../assets/auth-logo.png')} style={{ width: 22, height: 22 }} resizeMode="contain" /><Text style={styles.titleText}>Duotone</Text></View>
    <View style={styles.dragRegion as any} />
    <View style={styles.windowButtons as any}>
      <Pressable accessibilityLabel="Minimize" onPress={() => window.duotoneDesktop?.minimize()} style={({ hovered }) => [styles.windowButton, hovered && styles.windowButtonHover]}><Ionicons name="remove-outline" size={17} color={desktop.muted} /></Pressable>
      <Pressable accessibilityLabel={maximized ? 'Restore' : 'Maximize'} onPress={() => window.duotoneDesktop?.toggleMaximize()} style={({ hovered }) => [styles.windowButton, hovered && styles.windowButtonHover]}><Ionicons name={maximized ? 'copy-outline' : 'square-outline'} size={13} color={desktop.muted} /></Pressable>
      <Pressable accessibilityLabel="Close" onPress={() => window.duotoneDesktop?.close()} style={({ hovered }) => [styles.windowButton, hovered && styles.closeHover]}><Ionicons name="close-outline" size={20} color={desktop.muted} /></Pressable>
    </View>
  </View>;
}

export function Sidebar({ route, navigate }: { route: Route; navigate: (route: Route) => void }) {
  const session = useAuth((s) => s.session);
  const active = route.name === 'artist' ? 'artists' : route.name === 'playlist' || route.name === 'import' ? 'playlists' : route.name;

  const [name, setName] = useState('Profile');
  const [avatar, setAvatar] = useState<AvatarChoice>({ emoji: '🎧', gradientIndex: 0 });
  const [hasSocialNotification, setHasSocialNotification] = useState(false);

  useEffect(() => {
    if (!session) return;
    
    // 1) Set initial values from cached session
    const currentName = (session?.user.user_metadata?.username as string | undefined) || (session?.user.user_metadata?.name as string | undefined) || session?.user.email?.split('@')[0] || 'Profile';
    setName(currentName);
    
    const userMeta = session?.user?.user_metadata;
    setAvatar({
      emoji: userMeta?.avatar_emoji || '🎧',
      gradientIndex: Number(userMeta?.avatar_gradient ?? 0),
      avatarUrl: userMeta?.avatar_url && !userMeta.avatar_url.startsWith('emoji:') ? userMeta.avatar_url : undefined
    });

    // 2) Asynchronously fetch fresh data from Supabase DB to sync with mobile
    const refreshProfile = async () => {
      const freshAvatar = await getAvatarChoice();
      setAvatar(freshAvatar);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: dbProf } = await supabase.from('profiles').select('name, username').eq('id', user.id).maybeSingle();
        const freshName = dbProf?.username || dbProf?.name || user.user_metadata?.username || user.user_metadata?.name || user.email?.split('@')[0] || 'Profile';
        setName(freshName);
      }
    };
    refreshProfile();
    window.addEventListener('duotone:refresh-profile', refreshProfile);

    // 3) Check inbox notification badge
    getInboxItems().then((items) => {
      setHasSocialNotification(items.length > 0);
    }).catch(() => {});
    const interval = setInterval(() => {
      getInboxItems().then((items) => {
        setHasSocialNotification(items.length > 0);
      }).catch(() => {});
    }, 10000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('duotone:refresh-profile', refreshProfile);
    };
  }, [session]);

  const avatarEmoji = avatar.emoji || '🎧';
  const avatarGradientIdx = avatar.gradientIndex ?? 0;
  const avatarUrl = avatar.avatarUrl;
  const cleanAvatarUrl = avatarUrl && !avatarUrl.startsWith('emoji:') ? avatarUrl : undefined;
  const colorsPair = AVATAR_GRADIENTS[avatarGradientIdx] || AVATAR_GRADIENTS[0];

  const avatarDisplay = cleanAvatarUrl ? (
    <Image source={{ uri: cleanAvatarUrl }} style={{ width: 31, height: 31, borderRadius: 9 }} />
  ) : (
    <View style={[styles.avatar, { backgroundImage: `linear-gradient(135deg, ${colorsPair[0]}, ${colorsPair[1]})` } as any]}>
      <Text style={{ fontSize: 13 }}>{avatarEmoji}</Text>
    </View>
  );

  return <View style={styles.sidebar}>
    <ScrollView contentContainerStyle={styles.sidebarContent}>
      <Text style={styles.navLabel}>DISCOVER</Text>
      {PRIMARY.map((item) => <NavItem key={item.id} active={active === item.id} {...item} badge={item.id === 'social' && hasSocialNotification} onPress={() => navigate({ name: item.id })} />)}
      <View style={styles.navDivider} /><Text style={styles.navLabel}>ACCOUNT</Text>
      <NavItem label="Profile" icon="person-circle-outline" active={active === 'profile'} onPress={() => navigate({ name: 'profile' })} />
      <NavItem label="Settings" icon="settings-outline" active={active === 'settings'} onPress={() => navigate({ name: 'settings' })} />
    </ScrollView>
    <Pressable onPress={() => navigate({ name: 'profile' })} style={({ hovered }) => [styles.account, hovered && styles.navHover]}>{avatarDisplay}<View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.accountName}>{name}</Text><Text numberOfLines={1} style={styles.accountEmail}>{session?.user.email}</Text></View><Ionicons name="chevron-forward" size={14} color={desktop.dim} /></Pressable>
  </View>;
}

export function NavItem({ label, icon, active, badge, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; badge?: boolean; onPress: () => void }) {
  const theme = useTheme((s) => s.theme);
  const P = Pressable as any;
  return <P className="nav-item-animate" onPress={onPress} style={({ hovered, focused, pressed }: any) => [styles.navItem, (hovered || focused) && styles.navHover, active && { backgroundColor: theme.soft }, pressed && ui.pressed]}><Ionicons name={icon} size={19} color={active ? theme.color : desktop.muted} /><Text style={[styles.navText, active && styles.navTextActive, active && { color: theme.color }]}>{label}</Text>{badge && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 4 }} />}</P>;
}

export function PlayerBar({ currentIsSaved, toggleSaveCurrent }: { currentIsSaved: boolean; toggleSaveCurrent: () => void }) {
  const p = usePlayer(); const ratio = p.durationMs ? Math.min(1, p.positionMs / p.durationMs) : 0;
  if (!p.current) return null;

  const startDragProgress = (mouseDownEvent: any) => {
    mouseDownEvent.preventDefault();
    const target = mouseDownEvent.currentTarget;
    const update = (moveEvent: any) => {
      const rect = target.getBoundingClientRect();
      const clientX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX;
      if (clientX === undefined) return;
      const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      p.seekTo(r * p.durationMs);
    };
    update(mouseDownEvent);
    const stop = () => {
      window.removeEventListener('mousemove', update);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', update);
      window.removeEventListener('touchend', stop);
    };
    window.addEventListener('mousemove', update);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', update);
    window.addEventListener('touchend', stop);
  };

  const startDragVolume = (mouseDownEvent: any) => {
    mouseDownEvent.preventDefault();
    const target = mouseDownEvent.currentTarget;
    const update = (moveEvent: any) => {
      const rect = target.getBoundingClientRect();
      const clientX = moveEvent.clientX ?? moveEvent.touches?.[0]?.clientX;
      if (clientX === undefined) return;
      const pct = Math.min(100, Math.max(0, Math.round(((clientX - rect.left) / rect.width) * 100)));
      p.setVolume(pct);
    };
    update(mouseDownEvent);
    const stop = () => {
      window.removeEventListener('mousemove', update);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('touchmove', update);
      window.removeEventListener('touchend', stop);
    };
    window.addEventListener('mousemove', update);
    window.addEventListener('mouseup', stop);
    window.addEventListener('touchmove', update);
    window.addEventListener('touchend', stop);
  };

  return <V style={styles.player} className="glass-panel">
    <YouTubePlayerView track={p.current} />
    <View style={styles.playerTrack}>
      <Pressable
        style={styles.playerTrackLink}
        onPress={() => window.dispatchEvent(new CustomEvent('duotone:navigate', { detail: { name: 'now-playing' } }))}
      >
        <Artwork track={p.current} size={52} />
        <Text numberOfLines={1} style={styles.playerTitle}>{p.current.title}</Text>
      </Pressable>
      <View style={styles.playerSave}>
        <IconButton
          name={currentIsSaved ? 'heart' : 'heart-outline'}
          label={currentIsSaved ? 'Remove from Saved Songs' : 'Save to Saved Songs'}
          onPress={toggleSaveCurrent}
          active={currentIsSaved}
        />
      </View>
    </View>
    <View style={styles.playerCenter}>
      <View style={styles.playerControls}>
        <IconButton name="shuffle" label={rotuloDoModo(modoDeShuffle(p.shuffle, p.shuffleInteligente))} active={p.shuffle} estrela={p.shuffleInteligente} onPress={p.toggleShuffle} />
        <IconButton name="play-skip-back" label="Previous" onPress={p.prev} />
        {p.showRewindButton && <IconButton name="play-back" label="Rewind 15 seconds" onPress={() => p.seekTo(Math.max(0, p.positionMs - 15000))} />}
        <Pressable accessibilityLabel={p.isPlaying ? 'Pause' : 'Play'} onPress={p.togglePlay} style={({ hovered, pressed }) => [styles.playButton, hovered && { transform: [{ scale: 1.05 }] }, pressed && { transform: [{ scale: .97 }] }]}><Ionicons name={p.buffering ? 'hourglass-outline' : p.isPlaying ? 'pause' : 'play'} size={19} color="#111117" /></Pressable>
        <IconButton name="play-skip-forward" label="Next" onPress={p.next} />
        <IconButton name={p.repeatMode === 'one' ? 'repeat' : 'repeat-outline'} label="Repeat" active={p.repeatMode !== 'off'} onPress={p.cycleRepeat} />
      </View>
      <View style={styles.progressRow}>
        <Text style={styles.timeText}>{formatTime(p.positionMs / 1000)}</Text>
        <P onMouseDown={startDragProgress} onTouchStart={startDragProgress} style={styles.progressHit} className="slider-container"><V style={styles.progressTrack}><V style={[styles.progressFill, { width: `${ratio * 100}%` }]} className="slider-fill" /></V><V className="slider-thumb" style={{ left: `${ratio * 100}%` }} /></P>
        <Text style={styles.timeText}>{formatTime(p.durationMs / 1000)}</Text>
      </View>
    </View>
    <View style={styles.playerRight}>
      {p.error && <Text numberOfLines={1} style={styles.playerError}>{p.error}</Text>}
      <V style={styles.volumeRow} className="slider-container"><Ionicons name={p.volume === 0 ? 'volume-mute-outline' : p.volume < 35 ? 'volume-low-outline' : p.volume < 70 ? 'volume-medium-outline' : 'volume-high-outline'} size={18} color={desktop.muted} onPress={() => p.setVolume(p.volume === 0 ? 80 : 0)} style={{ cursor: 'pointer', transition: 'color 0.2s' } as any} /><P onMouseDown={startDragVolume} onTouchStart={startDragVolume} style={styles.volumeHit}><V style={styles.volumeTrack}><V style={[styles.volumeFill, { width: `${p.volume}%` }]} className="slider-fill" /></V><V className="slider-thumb" style={{ left: `${p.volume}%` }} /></P></V>
      <IconButton name="close" label="Close player" onPress={p.close} />
    </View>
  </V>;
}
