import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

/**
 * WebView INVISÍVEL que carrega o embed real do YouTube e "escuta" a resposta
 * genuína que a própria página pede ao servidor de vídeo — em vez de tentarmos
 * replicar o token de origem (PO Token / BotGuard) que a Google exige. A
 * página oficial sabe gerar esse token sozinha; nós só precisamos de capturar
 * o resultado antes/depois do JS dela o consumir.
 *
 * DUAS camadas de captura, porque não sabemos ao certo qual mecanismo interno
 * o YouTube usa e queremos o máximo de hipóteses de apanhar alguma coisa:
 *
 * 1. Rede — `injectedJavaScriptBeforeContentLoaded` corre ANTES de qualquer
 *    script da página, por isso conseguimos substituir `fetch`/
 *    `XMLHttpRequest`/`Worker` antes da página os usar, e inspecionar
 *    qualquer texto que contenha `"streamingData"` (a resposta do endpoint
 *    /youtubei/v1/player). Confirmámos que o player embed cria um `Worker`
 *    (scope isolado da window principal — só `fetch`/`XHR` não bastava).
 *
 * 2. Elemento `<video>` — mais robusto e universal: em vez de tentar prever
 *    COMO a página obtém o URL, observamos diretamente o `<video>`/`<audio>`
 *    real da página e capturamos o URL que ele acaba por carregar
 *    (`currentSrc`). Se a página atribui o URL assinado diretamente ao
 *    elemento (sem nunca passar por fetch/XHR que consigamos ver — ex. via
 *    MediaSource ou HLS nativo do WebKit), esta camada ainda funciona,
 *    porque o URL tem de lá estar para o vídeo tocar.
 *
 * EXPERIMENTAL: depende de detalhes internos da página do YouTube que a
 * Google pode mudar sem aviso. Se não capturar nada dentro do timeout,
 * `onResult` recebe `null` e o YouTubePlayerView cai no resolver próprio
 * (ytstream.ts) e depois no embed visível, como acontecia antes.
 */

const INTERCEPT_JS = `
(function () {
  if (window.__duotoneHarvest) { return; }
  window.__duotoneHarvest = true;

  function reportPlayerResponse(raw) {
    try {
      var text = typeof raw === 'string' ? raw : JSON.stringify(raw);
      if (typeof text === 'string' && text.indexOf('"streamingData"') !== -1) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'player', body: text }));
      }
    } catch (e) {}
  }

  // --- Camada 1: fetch / XMLHttpRequest / Worker ---
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function () {
      var p = origFetch.apply(this, arguments);
      p.then(function (res) {
        try {
          res.clone().text().then(reportPlayerResponse).catch(function () {});
        } catch (e) {}
      }).catch(function () {});
      return p;
    };
  }

  var OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    var xhr = new OrigXHR();
    xhr.addEventListener('load', function () {
      try { reportPlayerResponse(xhr.responseText); } catch (e) {}
    });
    return xhr;
  }
  window.XMLHttpRequest = PatchedXHR;

  var OrigWorker = window.Worker;
  if (OrigWorker) {
    window.Worker = function (scriptURL, options) {
      var w = new OrigWorker(scriptURL, options);
      var origPostMessage = w.postMessage.bind(w);
      w.postMessage = function (msg) {
        reportPlayerResponse(msg);
        return origPostMessage.apply(w, arguments);
      };
      w.addEventListener('message', function (ev) {
        reportPlayerResponse(ev && ev.data);
      });
      return w;
    };
    window.Worker.prototype = OrigWorker.prototype;
  }

  // --- Camada 2: observar o <video>/<audio> real e o URL que carrega ---
  var reportedUrl = null;
  function checkMediaSrc() {
    var el = document.querySelector('video') || document.querySelector('audio');
    if (!el) return;
    var src = el.currentSrc || el.src;
    if (src && src.indexOf('http') === 0 && src !== reportedUrl) {
      reportedUrl = src;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'rawUrl', url: src }));
    }
  }
  setInterval(checkMediaSrc, 400);
})();
true;
`;

export type HarvestResult = { kind: 'playerResponse'; data: any } | { kind: 'rawUrl'; url: string };

interface Props {
  videoId: string;
  /** `null` quando expira o timeout sem capturar nada. */
  onResult: (result: HarvestResult | null) => void;
  timeoutMs?: number;
}

export function YtStreamHarvester({ videoId, onResult, timeoutMs = 10000 }: Props) {
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
      if (msg.type === 'player') {
        const data = JSON.parse(msg.body);
        if (data?.streamingData) {
          doneRef.current = true;
          onResultRef.current({ kind: 'playerResponse', data });
        }
      } else if (msg.type === 'rawUrl' && typeof msg.url === 'string') {
        doneRef.current = true;
        onResultRef.current({ kind: 'rawUrl', url: msg.url });
      }
    } catch {
      // ignorar mensagens que não sejam JSON válido
    }
  };

  // mute=1 — esta WebView está escondida, mas o embed toca a sério. Sem
  // silenciar, ouvia-se a música duas vezes (aqui e no player nativo)
  // durante a captura. Silenciada, a página carrega e pede o stream na
  // mesma — que é tudo o que precisamos dela.
  // SEM header Referer e SEM parâmetro origin, de propósito: no dispositivo
  // provocavam "Load failed" (ver BotGuardMinter.tsx). Num browser de
  // secretária a falta deles dá `embedder.identity.missing.referrer`, mas o
  // que vale é o comportamento no WKWebView, onde esta config já se
  // comprovou carregar o embed — incl. em dados móveis.
  const uri = `https://www.youtube.com/embed/${videoId}?playsinline=1&autoplay=1&mute=1&rel=0&controls=0`;

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
