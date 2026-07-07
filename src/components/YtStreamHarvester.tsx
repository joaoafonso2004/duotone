import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

/**
 * WebView INVISÍVEL que carrega o embed real do YouTube e "escuta" a resposta
 * genuína que a própria página pede ao servidor de vídeo — em vez de tentarmos
 * replicar o token de origem (PO Token / BotGuard) que a Google exige. A
 * página oficial sabe gerar esse token sozinha; nós só precisamos de
 * intercetar a resposta antes do JS dela a consumir.
 *
 * Mecanismo: `injectedJavaScriptBeforeContentLoaded` corre ANTES de qualquer
 * script da página, por isso conseguimos substituir `fetch`/`XMLHttpRequest`
 * antes da página os usar. Sempre que uma resposta contém `"streamingData"`
 * (a resposta do endpoint /youtubei/v1/player, seja qual for o transporte
 * exato que a página usa), reenviamo-la para o React Native.
 *
 * EXPERIMENTAL: isto depende de detalhes internos da página do YouTube que a
 * Google pode mudar sem aviso. Se não intercetar nada dentro do timeout,
 * `onResult` recebe `null` e o YouTubePlayerView cai no resolver próprio
 * (ytstream.ts) e depois no embed visível, como acontecia antes.
 */

const INTERCEPT_JS = `
(function () {
  if (window.__duotoneHarvest) { return; }
  window.__duotoneHarvest = true;

  function report(bodyText) {
    try {
      if (typeof bodyText === 'string' && bodyText.indexOf('"streamingData"') !== -1) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'player', body: bodyText }));
      }
    } catch (e) {}
  }

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function () {
      var p = origFetch.apply(this, arguments);
      p.then(function (res) {
        try {
          res.clone().text().then(report).catch(function () {});
        } catch (e) {}
      }).catch(function () {});
      return p;
    };
  }

  var OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    var xhr = new OrigXHR();
    xhr.addEventListener('load', function () {
      try { report(xhr.responseText); } catch (e) {}
    });
    return xhr;
  }
  window.XMLHttpRequest = PatchedXHR;
})();
true;
`;

interface Props {
  videoId: string;
  /** `null` quando expira o timeout sem intercetar nada. */
  onResult: (playerResponse: any | null) => void;
  timeoutMs?: number;
}

export function YtStreamHarvester({ videoId, onResult, timeoutMs = 8000 }: Props) {
  const doneRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    doneRef.current = false;
    const timer = setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        onResultRef.current(null);
      }
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [videoId, timeoutMs]);

  const onMessage = (e: WebViewMessageEvent) => {
    if (doneRef.current) return;
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type !== 'player') return;
      const data = JSON.parse(msg.body);
      if (data?.streamingData) {
        doneRef.current = true;
        onResultRef.current(data);
      }
    } catch {
      // ignorar mensagens que não sejam JSON válido do player
    }
  };

  const uri = `https://www.youtube.com/embed/${videoId}?playsinline=1&autoplay=1&rel=0&controls=0`;

  return (
    <WebView
      key={videoId}
      source={{ uri }}
      style={styles.hidden}
      injectedJavaScriptBeforeContentLoaded={INTERCEPT_JS}
      onMessage={onMessage}
      javaScriptEnabled
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    top: -1000,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
});
