import { closePlayerSmoothly, confirmaSwipe } from '../lib/closePlayer';
import { FriendAvatar } from '../components/FriendAvatar';
import { getPublicProfiles } from '../api/profiles';
import { useSocial } from '../state/social';
import { naoLidasPorAmigo } from '../lib/social';
import { useReducedMotion } from '../hooks/useReducedMotion';
/**
 * A casca da janela: barra de título, barra lateral e barra do leitor.
 *
 * O CSS do documento também vive aqui — as fontes são embutidas
 * (`assets/fonts`) e registadas em `@font-face`, nunca por CDN: a app tem de
 * abrir igual sem rede. E a família vai EXPLÍCITA em cada estilo de texto,
 * porque o react-native-web impõe a stack dele a cada `<Text>`.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { YouTubePlayerView } from '../components/YouTubePlayerView';
import { modoDeShuffle, rotuloDoModo } from '../lib/smartShuffle';
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
    /* As particulas do modo inteligente atravessam da direita para a
       esquerda. A camada tem o dobro da largura e leva o campo duas vezes,
       por isso deslizar -50% cai num sitio onde a imagem e igual e o ciclo
       nao se ve. */
    @keyframes duotone-atravessar {
      from { transform: translateX(0); }
      to   { transform: translateX(-50%); }
    }
    @keyframes duotone-respirar {
      0%, 100% { opacity: .35; }
      50%      { opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      /* Quem pediu menos movimento nao leva pontos a piscar. O seletor apanha
         qualquer elemento com este keyframe, porque o react-native-web nao
         deixa passar classes nossas. */
      *[style*="duotone-atravessar"], *[style*="duotone-respirar"] { animation: none !important; opacity: .5 !important; }
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

  const [name,setName]=useState('Profile');
  const [publicAvatar,setPublicAvatar]=useState<string|null>(null);
  const profileVersion=useSocial(s=>s.profileVersion);
  const socialReceived=useSocial(s=>s.received);
  const socialSeen=useSocial(s=>s.seen);
  const socialFriends=useSocial(s=>s.friends);
  useEffect(()=>{
    let active=true;
    if(!session)return;
    const refresh=()=>getPublicProfiles([session.user.id]).then(([p])=>{if(active&&p){setName(p.name);setPublicAvatar(p.avatar_url);}}).catch(()=>{});
    void refresh();
    return()=>{active=false;};
  },[session?.user.id,profileVersion]);
  const avatarDisplay=<FriendAvatar avatarUrl={publicAvatar} name={name} size={31}/>;

  return <View style={styles.sidebar}>
    <ScrollView contentContainerStyle={styles.sidebarContent}>
      <Text style={styles.navLabel}>DISCOVER</Text>
      {PRIMARY.map((item) => <NavItem key={item.id} active={active === item.id} {...item} badge={item.id === 'social' && (naoLidasPorAmigo(socialReceived,socialSeen).size>0 || socialFriends.some(f=>f.status==='pending'&&!f.isSender))} onPress={() => navigate({ name: item.id })} />)}
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
  const [dragX,setDragX]=useState(0);
  const swipeWidth=useRef(360),swiping=useRef(false);
  const reducedMotion=useReducedMotion();
  useEffect(()=>{setDragX(0);},[p.current]);
  const dragClose = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e,g)=>!usePlayer.getState().closing&&g.dx>14&&g.dx>Math.abs(g.dy)*1.5,
    onPanResponderGrant:()=>{swiping.current=true;},
    onPanResponderMove:(_e,g)=>setDragX(Math.max(0,g.dx)),
    onPanResponderRelease: (_e,g)=>{if(confirmaSwipe(g.dx,g.dy,g.vx,swipeWidth.current))void closePlayerSmoothly();else setDragX(0);setTimeout(()=>{swiping.current=false;},200);},
    onPanResponderTerminate:()=>{setDragX(0);swiping.current=false;},
  })).current;
  const volumeAudivel = useRef(80);
  if (p.volume > 0) volumeAudivel.current = p.volume;
  const alternarSilencio = () => {
    p.setVolume(p.volume > 0 ? 0 : volumeAudivel.current || 80);
  };
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

  return <V style={[styles.player,{opacity:p.closeGain*Math.max(0.2,1-dragX/swipeWidth.current),transform:[{translateX:reducedMotion?0:dragX+(1-p.closeGain)*180}]}]} className="glass-panel">
    <YouTubePlayerView track={p.current} />
    <View style={styles.playerTrack} {...dragClose.panHandlers} onLayout={e=>{swipeWidth.current=e.nativeEvent.layout.width;}}>
      <Pressable
        style={styles.playerTrackLink}
        onPress={() => {if(!swiping.current)window.dispatchEvent(new CustomEvent('duotone:navigate', { detail: { name: 'now-playing' } }));}}
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
        {/* O icone e o MESMO nos dois modos: o `repeat` e o `repeat-outline`
            do Ionicons sao praticamente iguais a este tamanho, e o botao
            ficava com dois estados a mostrar um. Quem os separa e o "1". */}
        <IconButton
          name="repeat"
          label={p.repeatMode === 'one' ? 'Repeat this track' : p.repeatMode === 'all' ? 'Repeat queue' : 'Repeat off'}
          active={p.repeatMode !== 'off'}
          marca={p.repeatMode === 'one' ? '1' : undefined}
          onPress={p.cycleRepeat}
        />
      </View>
      <View style={styles.progressRow}>
        <Text style={styles.timeText}>{formatTime(p.positionMs / 1000)}</Text>
        <P onMouseDown={startDragProgress} onTouchStart={startDragProgress} style={styles.progressHit} className="slider-container"><V style={styles.progressTrack}><V style={[styles.progressFill, { width: `${ratio * 100}%` }]} className="slider-fill" /></V><V className="slider-thumb" style={{ left: `${ratio * 100}%` }} /></P>
        <Text style={styles.timeText}>{formatTime(p.durationMs / 1000)}</Text>
      </View>
    </View>
    <View style={styles.playerRight}>
      {p.error && <Text numberOfLines={1} style={styles.playerError}>{p.error}</Text>}
      <V style={styles.volumeRow} className="slider-container"><Ionicons name={p.volume === 0 ? 'volume-mute-outline' : p.volume < 35 ? 'volume-low-outline' : p.volume < 70 ? 'volume-medium-outline' : 'volume-high-outline'} size={18} color={desktop.muted} onPress={alternarSilencio} accessibilityRole="button" accessibilityLabel={p.volume === 0 ? 'Unmute' : 'Mute'} style={{ cursor: 'pointer', transition: 'color 0.2s' } as any} /><P onMouseDown={startDragVolume} onTouchStart={startDragVolume} style={styles.volumeHit}><V style={styles.volumeTrack}><V style={[styles.volumeFill, { width: `${p.volume}%` }]} className="slider-fill" /></V><V className="slider-thumb" style={{ left: `${p.volume}%` }} /></P></V>
      <IconButton name="close" label="Close player" onPress={()=>void closePlayerSmoothly()} />
    </View>
  </V>;
}
