import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { usePlayer } from '../state/player';

/**
 * Player oficial do YouTube via IFrame Player API dentro de um WKWebView.
 *
 * Regras do projeto (NÃO alterar):
 * - O vídeo, a marca e os anúncios do YouTube ficam intactos e visíveis.
 * - Nunca extrair/guardar o stream de áudio fora do WebView.
 */
export function YouTubePlayerView({ videoId }: { videoId: string }) {
  const webRef = useRef<WebView>(null);
  const registerYtControls = usePlayer((s) => s.registerYtControls);
  const onStateChange = usePlayer((s) => s._onYtStateChange);
  const setProgress = usePlayer((s) => s._setProgress);

  const html = useMemo(
    () => `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}
#player{position:absolute;inset:0;width:100%;height:100%}</style>
</head><body>
<div id="player"></div>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
var player;
function post(m){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));}
function onYouTubeIframeAPIReady(){
  player=new YT.Player('player',{
    videoId:${JSON.stringify(videoId)},
    playerVars:{autoplay:1,playsinline:1,rel:0},
    events:{
      onReady:function(e){post({type:'ready'});e.target.playVideo();},
      onStateChange:function(e){
        if(e.data===1)post({type:'state',value:'playing'});
        else if(e.data===2)post({type:'state',value:'paused'});
        else if(e.data===0)post({type:'state',value:'ended'});
      }
    }
  });
}
window.__duotone={
  play:function(){if(player&&player.playVideo)player.playVideo();},
  pause:function(){if(player&&player.pauseVideo)player.pauseVideo();},
  seek:function(s){if(player&&player.seekTo)player.seekTo(s,true);}
};
setInterval(function(){
  if(player&&player.getCurrentTime){
    post({type:'progress',
      position:(player.getCurrentTime()||0)*1000,
      duration:(player.getDuration()||0)*1000});
  }
},1000);
</script></body></html>`,
    [videoId]
  );

  useEffect(() => {
    registerYtControls({
      play: () =>
        webRef.current?.injectJavaScript('window.__duotone.play();true;'),
      pause: () =>
        webRef.current?.injectJavaScript('window.__duotone.pause();true;'),
      seek: (ms: number) =>
        webRef.current?.injectJavaScript(
          `window.__duotone.seek(${(ms / 1000).toFixed(2)});true;`
        ),
    });
    return () => registerYtControls(null);
  }, [videoId, registerYtControls]);

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'state') {
        onStateChange(msg.value);
      } else if (msg.type === 'progress' && msg.duration > 0) {
        setProgress(msg.position, msg.duration);
      }
    } catch {
      // ignorar mensagens inválidas
    }
  };

  return (
    <WebView
      ref={webRef}
      key={videoId}
      source={{ html, baseUrl: 'https://www.youtube.com' }}
      originWhitelist={['*']}
      style={styles.web}
      onMessage={onMessage}
      javaScriptEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo={false}
      scrollEnabled={false}
      bounces={false}
    />
  );
}

const styles = StyleSheet.create({
  web: {
    flex: 1,
    backgroundColor: '#000',
  },
});
