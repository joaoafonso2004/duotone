import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import {
  handleBotGuardMessage,
  registerBotGuardWebView,
  unregisterBotGuardWebView,
} from '../lib/botguardBridge';

/**
 * Gera PO Tokens (Proof of Origin) inteiramente NO DISPOSITIVO, sem qualquer
 * servidor externo — implementa a mesma lógica do
 * https://github.com/LuanRT/BgUtils (traduzida de TS para JS simples, sem
 * dependências) mas corre-a dentro de uma WebView escondida em vez de num
 * servidor Node com `jsdom` (como faz o
 * https://github.com/Brainicism/bgutil-ytdlp-pot-provider, indicado pelo
 * professor). A vantagem: a WKWebView é um motor WebKit A SÉRIO — tem DOM,
 * Canvas, WebGL, IndexedDB — exatamente o que o desafio BotGuard da Google
 * verifica para confirmar que não é um bot. `jsdom` é só uma simulação; isto
 * é o motor genuíno do Safari.
 *
 * Montada UMA VEZ em App.tsx (nunca desmonta, independente da música a
 * tocar) porque resolver o desafio + obter o "integrity token" tem um custo
 * de rede — só o passo final de "cunhar" (mint) o token para cada
 * videoId/visitorData é que é local e rápido, e esse é repetido por música
 * via `window.__duotoneMint`.
 *
 * Ver src/lib/botguardBridge.ts (a ponte entre este componente e
 * src/api/potProvider.ts, que não é um componente React e por isso não pode
 * ter uma `ref` para esta WebView diretamente) e GUIA-POT-TOKEN.md.
 *
 * Falha para `null` em qualquer erro (desafio rejeitado, VM não carrega,
 * timeout) — nunca bloqueia a reprodução; ytstream.ts continua sem PO Token
 * como acontecia antes.
 */

// Vídeo âncora só para dar à WebView um documento real com origem
// youtube.com (para os pedidos serem same-origin) — não tem de corresponder
// à música a tocar. "Me at the zoo", o primeiro vídeo do YouTube: estável há
// duas décadas, risco mínimo de deixar de existir.
const ANCHOR_VIDEO_ID = 'jNQXAC9IVRw';

// Versão do cliente WEB usada só para pedir o desafio BotGuard
// (`/youtubei/v1/att/get`) — não precisa de ser exata, mas convém
// atualizar de vez em quando (ver nota semelhante em ytstream.ts).
const WEB_CLIENT_VERSION = '2.20260630.01.00';

const BOTGUARD_JS = `
(function () {
  if (window.__duotoneBotGuardReady) { return; }
  window.__duotoneBotGuardReady = true;

  var REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
  // Dentro de um browser (esta WebView) NÃO se pode chamar
  // jnn-pa.googleapis.com diretamente — é bloqueado por CORS. A própria
  // página do YouTube usa um proxy same-origin em youtube.com/api/jnn/v1/*
  // (é assim que o BgUtils funciona em modo browser, com useYouTubeAPI:true).
  var WAA_BASE = 'https://www.youtube.com/api/jnn/v1';
  var WAA_API_KEY = 'AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw';

  function post(msg) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {}
  }

  function b64ToU8(b64) {
    var mod = b64.replace(/[-_.]/g, function (c) {
      return c === '-' ? '+' : c === '_' ? '/' : '=';
    });
    var bin = atob(mod);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function u8ToB64(u8, urlSafe) {
    var s = '';
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    var out = btoa(s);
    if (urlSafe) out = out.replace(/\\+/g, '-').replace(/\\//g, '_');
    return out;
  }

  function waaHeaders() {
    return {
      'content-type': 'application/json+protobuf',
      'x-goog-api-key': WAA_API_KEY,
      'x-user-agent': 'grpc-web-javascript/0.1'
    };
  }

  // --- BotGuardClient (adaptado de LuanRT/BgUtils src/core/botGuardClient.ts) ---
  function BotGuardClient(opts) {
    this.vm = opts.globalObj[opts.globalName];
    this.program = opts.program;
    var self = this;
    this._vmFnsPromise = new Promise(function (resolve) { self._resolveVmFns = resolve; });
  }
  BotGuardClient.create = async function (opts) {
    var c = new BotGuardClient(opts);
    if (!c.vm || !c.vm.a) throw new Error('VM init function not found');
    var cb = function (asyncSnapshotFunction) {
      c._resolveVmFns({ asyncSnapshotFunction: asyncSnapshotFunction });
    };
    await c.vm.a(c.program, cb, true, undefined, function () {}, [[], []])[0];
    return c;
  };
  BotGuardClient.prototype.snapshot = async function (args) {
    var fns = await this._vmFnsPromise;
    if (!fns.asyncSnapshotFunction) throw new Error('asyncSnapshotFunction not found');
    return new Promise(function (resolve, reject) {
      try {
        fns.asyncSnapshotFunction(function (r) { resolve(r); }, [
          args.contentBinding, args.signedTimestamp, args.webPoSignalOutput, args.skipPrivacyBuffer
        ]);
      } catch (e) { reject(e); }
    });
  };

  // --- WebPoMinter (adaptado de webPoMinter.ts) ---
  function WebPoMinter(mintCallback) { this.mintCallback = mintCallback; }
  WebPoMinter.create = async function (integrityToken, webPoSignalOutput) {
    var getMinter = webPoSignalOutput[0];
    if (!getMinter) throw new Error('PMD:Undefined');
    if (!integrityToken) throw new Error('No integrity token');
    var mintCallback = await getMinter(b64ToU8(integrityToken));
    if (typeof mintCallback !== 'function') throw new Error('APF:Failed');
    return new WebPoMinter(mintCallback);
  };
  WebPoMinter.prototype.mintAsWebsafeString = async function (identifier) {
    var result = await this.mintCallback(new TextEncoder().encode(identifier));
    if (!result || !(result instanceof Uint8Array)) throw new Error('mint failed');
    return u8ToB64(result, true);
  };

  // --- desafio + integrity token: caro, feito uma vez e reaproveitado ---
  var minterPromise = null;

  async function loadMinter() {
    var attRes = await fetch('https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '${WEB_CLIENT_VERSION}' } },
        engagementType: 'ENGAGEMENT_TYPE_UNBOUND'
      })
    });
    if (!attRes.ok) throw new Error('att/get HTTP ' + attRes.status);
    var attData = await attRes.json();
    var challenge = attData && attData.bgChallenge;
    if (!challenge) throw new Error('no bgChallenge in response');

    var interpreterUrl = 'https:' + challenge.interpreterUrl.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
    var interpreterJs = await (await fetch(interpreterUrl)).text();
    if (!interpreterJs) throw new Error('empty interpreter script');
    // eslint-disable-next-line no-new-func
    new Function(interpreterJs)();

    var bgClient = await BotGuardClient.create({
      program: challenge.program,
      globalName: challenge.globalName,
      globalObj: window
    });

    var webPoSignalOutput = [];
    var botguardResponse = await bgClient.snapshot({ webPoSignalOutput: webPoSignalOutput });

    var itRes = await fetch(WAA_BASE + '/GenerateIT', {
      method: 'POST',
      headers: waaHeaders(),
      body: JSON.stringify([REQUEST_KEY, botguardResponse])
    });
    if (!itRes.ok) throw new Error('GenerateIT HTTP ' + itRes.status);
    var itJson = await itRes.json();
    var integrityToken = itJson && itJson[0];
    if (!integrityToken) throw new Error('empty integrity token');

    return WebPoMinter.create(integrityToken, webPoSignalOutput);
  }

  window.__duotoneMint = async function (id, contentBinding) {
    try {
      if (!minterPromise) minterPromise = loadMinter();
      var minter;
      try {
        minter = await minterPromise;
      } catch (e) {
        minterPromise = null; // permite tentar de novo na próxima chamada
        throw e;
      }
      var poToken = await minter.mintAsWebsafeString(contentBinding);
      post({ id: id, poToken: poToken });
    } catch (e) {
      post({ id: id, error: (e && e.message) || String(e) });
    }
  };

  post({ id: '__ready__' });
})();
true;
`;

export function BotGuardMinter() {
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    registerBotGuardWebView(webRef);
    return () => unregisterBotGuardWebView();
  }, []);

  const onMessage = (e: WebViewMessageEvent) => {
    handleBotGuardMessage(e.nativeEvent.data);
  };

  // Diagnóstico: se a própria página falhar a carregar (rede em baixo, ou —
  // caso plausível na UE — um redirecionamento para consent.youtube.com que
  // muda a origem e parte os pedidos same-origin ao InnerTube), o script
  // injetado nunca chega a correr. Sem isto, "não sei porque falhou" seria a
  // única resposta possível à distância.
  const onError = (e: any) => {
    handleBotGuardMessage(
      JSON.stringify({
        id: '__loaderror__',
        error: e?.nativeEvent?.description ?? e?.nativeEvent?.code ?? 'load error',
      })
    );
  };
  const onHttpError = (e: any) => {
    handleBotGuardMessage(
      JSON.stringify({
        id: '__loaderror__',
        error: `HTTP ${e?.nativeEvent?.statusCode} em ${e?.nativeEvent?.url}`,
      })
    );
  };

  // CRÍTICO: a WebView vai DENTRO de um container absoluto de tamanho fixo. O
  // react-native-webview embrulha-se num container que, por omissão, tem
  // `flex: 1` — se fosse irmão direto do navegador numa coluna flex, ficava
  // com metade do ecrã e partia o layout de toda a app. O container absoluto
  // tira-o do fluxo e dá-lhe um frame concreto (o WKWebView do iOS precisa de
  // um frame válido para carregar a página — sem ele dava "Load failed").
  // A config aqui é DELIBERADAMENTE igual à do YtStreamHarvester, que já se
  // comprovou carregar a página embed no dispositivo (incl. em dados móveis):
  // mesmo URL (sem header Referer nem parâmetro origin, que provocavam "Load
  // failed"), mesmos props. Só o script injetado é diferente.
  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      <WebView
        ref={webRef}
        source={{
          uri: `https://www.youtube.com/embed/${ANCHOR_VIDEO_ID}?playsinline=1&autoplay=1&rel=0&controls=0`,
        }}
        style={styles.fill}
        injectedJavaScriptBeforeContentLoaded={BOTGUARD_JS}
        onMessage={onMessage}
        onError={onError}
        onHttpError={onHttpError}
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Fora do fluxo de layout, tamanho fixo e efetivamente invisível — mas com
  // um frame real para o WKWebView carregar a página.
  hiddenContainer: {
    position: 'absolute',
    top: -1000,
    left: 0,
    width: 2,
    height: 2,
    opacity: 0,
    overflow: 'hidden',
  },
  fill: {
    width: 2,
    height: 2,
  },
});
