import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Consultar, RespostaDoLeitor } from '../lib/leitorWebDoSpotify';
import {
  AGENTE_DO_SAFARI_DO_MAC, chamadaDaConsulta, chegouAoLeitor, doGoogle, ENDERECO_DO_LEITOR, ENDERECO_DO_LOGIN, lerMensagem,
  SCRIPT_DO_LEITOR,
} from '../lib/scriptDoLeitorDoSpotify';
import { colors, spacing, type } from '../theme';
import { DentroDeUmModal } from './dentroDeUmModal';

/**
 * A conta do Spotify no iPhone, pelo leitor web (11/11). As regras e o script
 * da página estão em `lib/scriptDoLeitorDoSpotify.ts`; aqui ficam as duas
 * WebViews:
 *
 * - `LeitorDoSpotifyEscondido`: o open.spotify.com num quadrado de 2 px fora
 *   do ecrã, como o `BotGuardMinter` (o WKWebView precisa de um frame a sério
 *   para carregar). As consultas entram por `injectJavaScript` e as respostas
 *   voltam por `postMessage`. Só existe enquanto se liga ou se lê.
 * - `LoginDoSpotify`: a página de login, numa folha. As duas partilham os
 *   cookies do WKWebView, por isso depois do login basta recarregar o leitor.
 *
 * Nada disto se guarda na app: a sessão é a do próprio Spotify, no WKWebView.
 */

const ESPERA_POR_CONSULTA_MS = 25_000;

export type LeitorDoSpotify = {
  consultar: Consultar;
  /** Volta a abrir a página (depois do login), e larga as consultas a meio. */
  recarregar: () => void;
};

export const LeitorDoSpotifyEscondido = forwardRef<LeitorDoSpotify, { aoPronto: () => void }>(function LeitorDoSpotifyEscondido({ aoPronto }, ref) {
  const web = useRef<WebView>(null);
  const pendentes = useRef(new Map<number, (r: RespostaDoLeitor) => void>());
  const contador = useRef(0);
  // A página pode dizer "pronto" a qualquer render: chama-se sempre a versão mais nova.
  const aoProntoAgora = useRef(aoPronto);
  aoProntoAgora.current = aoPronto;

  useImperativeHandle(ref, () => ({
    consultar: (nome, variaveis) => new Promise<RespostaDoLeitor>((resolver) => {
      const id = ++contador.current;
      const relogio = setTimeout(() => {
        pendentes.current.delete(id);
        resolver({ ok: false, falha: 'rede' });
      }, ESPERA_POR_CONSULTA_MS);
      pendentes.current.set(id, (r) => { clearTimeout(relogio); resolver(r); });
      web.current?.injectJavaScript(chamadaDaConsulta(id, nome, variaveis));
    }),
    recarregar: () => {
      for (const f of pendentes.current.values()) f({ ok: false, falha: 'rede' });
      pendentes.current.clear();
      web.current?.reload();
    },
  }), []);

  const aoMensagem = (e: WebViewMessageEvent) => {
    const m = lerMensagem(e.nativeEvent.data);
    if (!m) return;
    if (m.tipo === 'pronto') { aoProntoAgora.current(); return; }
    const f = pendentes.current.get(m.id);
    if (!f) return;
    pendentes.current.delete(m.id);
    f(m.ok ? { ok: true, dados: m.dados } : { ok: false, falha: m.falha });
  };

  return (
    <View style={estilos.escondido} pointerEvents="none">
      <WebView
        ref={web}
        source={{ uri: ENDERECO_DO_LEITOR }}
        style={estilos.doisPontos}
        userAgent={AGENTE_DO_SAFARI_DO_MAC}
        injectedJavaScriptBeforeContentLoaded={SCRIPT_DO_LEITOR}
        onMessage={aoMensagem}
        javaScriptEnabled
        // O leitor nunca toca: não pode mexer no som da app.
        mediaPlaybackRequiresUserAction
        allowsInlineMediaPlayback={false}
        // Só páginas: um "spotify://" de abrir a app fica pelo caminho.
        onShouldStartLoadWithRequest={(r) => /^https:\/\//i.test(r.url) || r.url === 'about:blank'}
      />
    </View>
  );
});

/** O aviso do Google: o login dele recusa WebViews ("disallowed_useragent"). */
function avisarDoGoogle() {
  Alert.alert(
    "Google doesn't allow signing in inside apps",
    'Type the email of your Google account in the Spotify login and choose to log in with a code. Spotify emails you a code, and no password is needed.',
  );
}

export function LoginDoSpotify({ visivel, aoEntrar, aoCancelar }: { visivel: boolean; aoEntrar: () => void; aoCancelar: () => void }) {
  return (
    <Modal visible={visivel} animationType="slide" presentationStyle="pageSheet" onRequestClose={aoCancelar}><DentroDeUmModal.Provider value>
      <View style={estilos.folha}>
        <View style={estilos.cabecalho}>
          <Pressable accessibilityRole="button" onPress={aoCancelar} hitSlop={12}>
            <Text style={[type.body, { color: colors.text }]}>Cancel</Text>
          </Pressable>
          <Text style={[type.headline, estilos.titulo]}>Log in to Spotify</Text>
          <View style={estilos.equilibrio} />
        </View>
        <Text style={[type.caption, estilos.dica]}>
          Signed up with Google? Type your Gmail address and log in with the code Spotify emails you.
        </Text>
        {visivel ? (
          <WebView
            source={{ uri: ENDERECO_DO_LOGIN }}
            style={estilos.pagina}
            javaScriptEnabled
            mediaPlaybackRequiresUserAction
            onShouldStartLoadWithRequest={(r) => {
              if (doGoogle(r.url)) { avisarDoGoogle(); return false; }
              return /^https:\/\//i.test(r.url) || r.url === 'about:blank';
            }}
            onNavigationStateChange={(n) => { if (chegouAoLeitor(n.url)) aoEntrar(); }}
          />
        ) : null}
      </View>
    </DentroDeUmModal.Provider></Modal>
  );
}

const estilos = StyleSheet.create({
  escondido: { position: 'absolute', top: -1000, left: 0, width: 2, height: 2, opacity: 0, overflow: 'hidden' },
  doisPontos: { width: 2, height: 2 },
  folha: { flex: 1, backgroundColor: colors.bg },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  titulo: { flex: 1, textAlign: 'center' },
  equilibrio: { width: 52 },
  dica: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, color: colors.textSecondary },
  pagina: { flex: 1, backgroundColor: colors.bg },
});
