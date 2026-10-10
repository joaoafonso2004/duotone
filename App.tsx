import 'react-native-url-polyfill/auto';
import { startConnectivity,useConnectivity } from './src/state/connectivity';
import { loadRecommendationFeedback,useRecommendationFeedback } from './src/state/recommendationFeedback';
import { refreshSuggestionPreferences } from './src/state/recomendacoes';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {useLyricsPrefetch} from './src/hooks/useLyricsPrefetch';
import { useComandosDoAparelho } from './src/lib/connectSync';
import { esquecerCapasAquecidas, useAquecerCapas } from './src/hooks/useAquecerCapas';
import { useAquecerSeccoes } from './src/hooks/useAquecerSeccoes';
import { useAquecerResolvedor } from './src/hooks/useAquecerResolvedor';
import { acompanharDownloads } from './src/state/capasGrandes';
import { esquecerBiblioteca } from './src/lib/cacheDaBiblioteca';
import { esquecerJamsDosAmigos } from './src/state/jamsDosAmigos';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { UpdateSheet } from './src/components/UpdateSheet';
import { RootNavigator } from './src/navigation/RootNavigator';
import {
  getAutoplayRadio,
  getKeepAwake,
  getRepeatMode,
  getShowRewindButton,
  getShuffle,
  getShuffleInteligente,
  getPlaybackRate,
  getEqGanhos,
  getEqPadrao,
  getCrossfadeSegundos,
  getIntensidadeDoSmartShuffle,
  getVolumeNormalization,
  loadPrefsCache,
} from './src/lib/prefs';
import { activateKeepAwakeAsync } from 'expo-keep-awake';
import { carregarFixados, idsProtegidos, podeLimpar } from './src/lib/downloadsFixados';
import { loadLoudnessCache } from './src/lib/loudnessCache';
import { supabase } from './src/lib/supabase';
import {
  invalidateStaleAudioCache,
  loadCachedAudioIndex,
  migrateAudioCacheToDocuments,
  pruneAudioCacheLRU,
  limparParciaisEsquecidos,
  listarDescarregados,
  definirDescarregadorNativo,
} from './src/lib/youtubeCache';
import { retireBackgroundInboxCheck } from './src/lib/backgroundInbox';
import { registarAntesDeSair, useAuth } from './src/state/auth';
import {chaveDaFaixa} from './src/lib/equalizer';
import { startTrackAdjustmentSync } from './src/state/trackAdjustments';
import { iniciarPresets } from './src/state/presets';
import { iniciarModoCarro } from './src/state/carro';
import { definirEmSegundoPlano, definirGuardarEscutaPorEnviar, definirPodeTocarSemRede, usePlayer } from './src/state/player';
import { guardarEscutaPorEnviar, instalarEnvioDeEscutas } from './src/state/escutasPorEnviar';
import { tocaSemRede } from './src/lib/descarregarFaixa';
import { descarregadorNativo } from './modules/duotone-download';
import { useTheme } from './src/state/theme';
import { useAcompanharCapa } from './src/hooks/useAcompanharCapa';
import { useRecomendacoes } from './src/state/recomendacoes';
import { useMisturaDoDia } from './src/state/misturaDoDia';
import { usePlaylists } from './src/state/playlists';
import { iniciarPresenca } from './src/lib/presenceSync';
import { useOuvirJuntos } from './src/state/ouvirJuntos';
import { useSeguirAmigo } from './src/state/seguirAmigo';
import { aquecerPerfilProprio, limparCachePerfil } from './src/lib/cachePerfil';
import { sincronizarPreferencias } from './src/lib/prefsSync';
import { ResumoDoMes } from './src/components/ResumoDoMes';
import { Abertura } from './src/components/Abertura';
import { iniciarEventos } from './src/lib/eventos';
import { iniciarSocial } from './src/state/social';
import { garantirPrivacidade } from './src/state/privacidade';
import { limparPerfisPublicos } from './src/state/perfisPublicos';
import { iniciarArtistasFavoritos, useArtistasFavoritos } from './src/state/artistasFavoritos';
import { iniciarNovosLancamentos } from './src/state/novosLancamentos';
import { useAparencia } from './src/state/aparencia';
import { limparVerificacao } from './src/state/verificacaoDaBiblioteca';
import { useSaved } from './src/state/saved';
import { instalarSaudeDaApp } from './src/state/saudeDaApp';
import { ligarMedicoes } from './src/state/medicoes';
import { ligarTempoAteAoSom } from './src/state/tempoAteAoSom';
import { instalarEscolhaDoCodec } from './src/state/saudeDoOpus';
import { vigiarOLeitor } from './src/state/vigiaDoLeitor';
import { iniciarMedidorDoFolego } from './src/state/folego';
import { iniciarEnergiaEmSegundoPlano } from './src/state/energiaEmSegundoPlano';
import { carregarRecentes, instalarRecentes } from './src/state/recentes';
import { BarreiraDeErros } from './src/components/BarreiraDeErros';

// Antes de qualquer ecrã: o handler global dos erros, o que ficou da abertura
// anterior e o relógio do arranque. Ver `state/saudeDaApp.ts`.
instalarSaudeDaApp();
ligarMedicoes();
// O tempo do pedido ao primeiro som, para o relatório (27/9).
ligarTempoAteAoSom();
// O JavaScript preso, e o que estava a crescer (1/10): o atraso do botão de
// pausa ao fim de algum tempo de app aberta. Só no iPhone; o PC tem a secção
// "resources" do relatório.
if (Platform.OS !== 'web') iniciarMedidorDoFolego();
// E o que a app gasta com o ecrã desligado (1/10): CPU por thread, bateria e
// estado térmico entre ir para trás e voltar. Só nas duas mudanças de estado.
if (Platform.OS !== 'web') iniciarEnergiaEmSegundoPlano();
// Quem decide se o iPhone pede Opus ou AAC (lib/codecDeAudio.ts). Até ler o
// disco, AAC.
void instalarEscolhaDoCodec();
// O que muda na loja do leitor, para a secção "speed" do relatório.
vigiarOLeitor();
// Modo offline (docs/PLANO-OFFLINE-SOCIAL-DESCOBERTA-PC.md, entrega 1): as
// escutas sem rede ficam guardadas e seguem quando ela volta; e no iPhone a
// fila sem rede só pára no que está no telemóvel.
definirGuardarEscutaPorEnviar(guardarEscutaPorEnviar);
instalarEnvioDeEscutas();
if (Platform.OS === 'ios') definirPodeTocarSemRede(tocaSemRede);
// O download do áudio fora do JavaScript (4/10, auditoria 4.1): os bocados vão
// do URLSession direto para o disco e o Opus converte-se no Swift. Sem o
// módulo no binário (uma build anterior), o download continua pelo JS.
if (Platform.OS === 'ios') definirDescarregadorNativo(descarregadorNativo);
// O "Jump back in" da Home do iPhone (3/10, lib/recentes.ts): cada lista nova
// com origem entra à frente.
// Também no PC desde 5/10 (auditoria de consistência A4, `desktop/VoltarAOuvir.web.tsx`).
instalarRecentes();
// A sessão do leitor grava-se no disco de 30 em 30 s em segundo plano (não de 3 em 3).
definirEmSegundoPlano(() => AppState.currentState === 'background');
// Sair da conta leva a música e a fila de quem sai (state/auth.ts), por todas as
// portas: "Sign out" e "apagar conta", nas duas plataformas.
registarAntesDeSair(() => usePlayer.getState().close());

export default function App() {
  // O acento segue a capa a tocar quando esse modo esta escolhido. Aqui em
  // cima porque a App e a raiz das duas plataformas -- um so sitio a ligar.
  useAcompanharCapa();
  useLyricsPrefetch();
  useEffect(startConnectivity,[]);
  const offline=useConnectivity(s=>s.offline);
  const sleepTimerEndsAt=usePlayer(s=>s.sleepTimerEndsAt);
  const init = useAuth((s) => s.init);
  const userId = useAuth((s) => s.session?.user.id);
  // As ordens dos outros aparelhos desta conta (Duotone Connect): "passa
  // para o PC", tocar/pausa, seguinte, anterior. Nas duas plataformas, e só
  // com conta -- sem ela não há ordens para ler (lib/connectSync.ts).
  useComandosDoAparelho(userId);
  // As capas da Pesquisa e do perfil, pedidas enquanto a abertura corre: os
  // dados já vinham no arranque, as imagens é que esperavam pelo primeiro
  // toque no separador.
  useAquecerCapas(userId);
  // E as secções: Songs, Artists e Playlists deixam de começar a carregar
  // ao primeiro toque no separador.
  useAquecerSeccoes(userId);
  // E o PO Token, que a primeira música depois de abrir a app pagava sozinha.
  useAquecerResolvedor(userId);
  const adjustmentUserId=useAuth(s=>s.session?.user.id??s.offlineUserId);
  useEffect(() => {
    if (adjustmentUserId) return iniciarArtistasFavoritos(adjustmentUserId);
    useArtistasFavoritos.getState().esquecer();
  }, [adjustmentUserId]);
  // Os novos lançamentos dos teus artistas (10/10): uma vez por dia, no aparelho.
  useEffect(() => {
    if (adjustmentUserId) return iniciarNovosLancamentos(adjustmentUserId);
  }, [adjustmentUserId]);
  // Os presets do equalizador: os teus, os da app mudados, e o do carro.
  useEffect(() => {
    if (adjustmentUserId) return iniciarPresets(adjustmentUserId);
  }, [adjustmentUserId]);
  // No carro (CarPlay ou o Bluetooth marcado), o preset do carro por cima.
  useEffect(() => iniciarModoCarro(), []);
  const [preferencesReady,setPreferencesReady]=useState(false);
  useEffect(()=>{
    if(!preferencesReady)return;
    const player=usePlayer.getState();player._carregarAjustes({},player.padraoGanhos,player.padraoRate);
    if(!adjustmentUserId)return;
    return startTrackAdjustmentSync(adjustmentUserId,values=>{
      const p=usePlayer.getState(),key=p.current?chaveDaFaixa(p.current):null;
      // Um polling sem alterações não aplica a meio da música um novo padrão
      // escolhido nas Definições para as faixas seguintes -- mas o PADRÃO em si
      // tem de chegar: sem isto a velocidade das Definições nunca passava de um
      // aparelho para o outro. Ver `_carregarPadrao`.
      if(!key||JSON.stringify(p.ajustesPorFaixa[key])===JSON.stringify(values[key]))p._carregarPadrao(values);
      else p._carregarAjustes(values,p.padraoGanhos,p.padraoRate);
    });
  },[adjustmentUserId,preferencesReady]);

  useEffect(() => {
    if (!userId||offline) return;
    const pararPresenca = iniciarPresenca(userId);
    // As preferências passam a viver na conta: reinstalar deixa de as apagar.
    const pararPrefs = sincronizarPreferencias(userId);
    const pararEventos = iniciarEventos(userId);
    const pararSocial = iniciarSocial(userId);
    // Fechar a app nao e sair de uma sessao de escuta: se ficou uma aberta,
    // volta-se a entrar nela em silencio. Sair e uma decisao, e faz-se pela
    // barra.
    void useOuvirJuntos.getState().ligar(userId);
    // O perfil fica lido antes de alguem la tocar. Ao sair da conta a cache
    // e esquecida: os dados de quem sai nao podem aparecer a quem entra.
    void aquecerPerfilProprio(userId);
    return () => {
      pararPresenca(); pararSocial(); pararPrefs(); pararEventos();
      useOuvirJuntos.getState().desligar();
      limparCachePerfil();
      esquecerCapasAquecidas();
      limparPerfisPublicos();
    };
  }, [userId,offline]);

  // O relatório do Library check é da biblioteca de quem sai. Só a conta o
  // apaga: com o efeito de cima, uma quebra de rede levava-o a meio.
  //
  // A cache da biblioteca sai pela mesma porta e pela mesma razão: a lista de
  // quem sai não pode aparecer a quem entra, mas ficar sem rede um instante
  // não pode deitá-la fora -- é quando ela mais serve.
  // Os artistas favoritos vão atrás: são as chaves da biblioteca de quem sai.
  useEffect(() => () => {
    limparVerificacao(); esquecerBiblioteca(); esquecerJamsDosAmigos();
    // E os corações "já guardada", que também decidem o questionário da
    // primeira vez (state/saved.ts).
    useSaved.getState().limpar();
    // Seguir um amigo é da conta que o seguiu (state/seguirAmigo.ts).
    useSeguirAmigo.getState().parar(null);
  }, [userId]);

  useEffect(() => {
    if (!userId||offline) return;
    let active=true;
    void loadRecommendationFeedback(userId).then(()=>{if(active)void useRecomendacoes.getState().carregar();});
    return () => {active=false;useRecomendacoes.getState().limpar();useMisturaDoDia.getState().limpar();};
  }, [userId,offline]);

  /**
   * As playlists saem com a conta.
   *
   * Ao lado do `limpar()` das recomendações, e pela mesma razão: agora que a
   * lista vive numa store e não morre com o ecrã, trocar de conta deixava as
   * playlists da conta anterior à vista até a rede responder. Com esta linha,
   * quem entra vê o esqueleto -- que é a verdade -- em vez da biblioteca de
   * outra pessoa.
   */
  // Os recentes da Home são da conta (no aparelho): trocar de conta troca-os.
  useEffect(() => { void carregarRecentes(userId ?? null); }, [userId]);

  useEffect(() => {
    if (!userId) { usePlaylists.getState().limpar(); return; }
    return () => { usePlaylists.getState().limpar(); };
  }, [userId]);

  useEffect(()=>useRecommendationFeedback.subscribe((next,prev)=>{
    if(next.revision!==prev.revision)refreshSuggestionPreferences();
  }),[]);
  useEffect(()=>{if(!userId)void loadRecommendationFeedback(null);},[userId]);
  useEffect(()=>{
    if(offline){supabase.auth.stopAutoRefresh();return;}
    supabase.auth.startAutoRefresh();
    void useAuth.getState().refreshSession().catch(()=>{});
  },[offline]);

  useEffect(() => {
    acompanharDownloads(); // também os downloads feitos antes de abrir o leitor
    init();
    // Hidrata preferências persistidas no arranque da app.
    loadPrefsCache();
    // Retira a tarefa antiga: os avisos móveis passam a existir só dentro da app.
    retireBackgroundInboxCheck();
    invalidateStaleAudioCache()
      // As músicas viviam na pasta Caches, que o iOS apaga sozinho quando
      // precisa de espaço — era por isso que os downloads desapareciam.
      // Passaram para Documents; isto muda de sítio o que já estava lá.
      .then(() => migrateAudioCacheToDocuments())
      // Os downloads pedidos TÊM de estar em memória antes da limpeza: sem
      // eles, ela só protegeria a fila e apagava o que foi guardado de
      // propósito. Na primeira abertura desta versão, o que já está em disco
      // fica uma semana protegido (lib/downloadsExplicitos.ts).
      .then(() => carregarFixados(() => listarDescarregados().map((f) => f.id)))
      .then(() => {
      // Índice em memória dos downloads (badges "offline" nas listas).
      loadCachedAudioIndex();
      // Arranque sem rede com a sessão restaurada numa faixa que não está no
      // telemóvel: passa, em pausa, para a primeira da fila que está. Só depois
      // do índice, que é o que diz o que está no disco.
      const ajustarSemRede = () => { usePlayer.getState().ajustarSessaoSemRede(); };
      if (usePlayer.persist.hasHydrated()) ajustarSemRede();
      else usePlayer.persist.onFinishHydration(ajustarSemRede);
      // O que ficou a meio de tocar enquanto descarregava, noutra sessão.
      limparParciaisEsquecidos();
      // Pruning LRU do cache de áudio — só no arranque, nunca durante a
      // reprodução, e protegendo a fila restaurada da sessão anterior.
      // Sem os pedidos lidos não se sabe o que proteger: fica para a próxima.
      const prune = () => {
        if (!podeLimpar()) return;
        pruneAudioCacheLRU([
          ...usePlayer.getState().queue.map((t) => t.sourceId),
          ...idsProtegidos(),
        ]);
      };
      if (usePlayer.persist.hasHydrated()) {if(!useConnectivity.getState().offline)prune();}
      else usePlayer.persist.onFinishHydration(()=>{if(!useConnectivity.getState().offline)prune();});
    });
    useTheme.getState().loadTheme();
    // A personalização (10/10, state/aparencia.ts): o fundo, as listas e o leitor.
    void useAparencia.getState().carregar();
    // A escuta privada tem de estar lida antes de alguém publicar: a presença
    // espera por ela, e o indicador do leitor mostra-a desde o primeiro ecrã.
    void garantirPrivacidade();
    // Loudness conhecida por vídeo (normalização de volume) — tem de estar em
    // memória antes de a primeira faixa arrancar.
    loadLoudnessCache();
    Promise.all([
      getRepeatMode(),
      getShuffle(),
      getShuffleInteligente(),
      getShowRewindButton(),
      getAutoplayRadio(),
      getVolumeNormalization(),
      getPlaybackRate(),
      getEqGanhos(),
      getEqPadrao(),
      getCrossfadeSegundos(),
      getIntensidadeDoSmartShuffle(),
    ]).then(([repeatMode, shuffle, shuffleInteligente, showRewindButton, autoplayRadio, volumeNormalization, playbackRate, eqGanhos, eqPadrao, crossfadeSegundos, intensidadeSmartShuffle]) => {
      const player = usePlayer.getState();
      player.setRepeatMode(repeatMode);
      player.setShuffle(shuffle);
      // O "inteligente" so vale com o shuffle ligado — ver lib/smartShuffle.ts.
      usePlayer.setState({ shuffleInteligente: shuffle && shuffleInteligente });
      player.setShowRewindButton(showRewindButton);
      player.setAutoplayRadio(autoplayRadio);
      player.setVolumeNormalization(volumeNormalization);
      // A memoria por faixa e os ganhos entram JUNTOS e sem reaplicar nada: o
      // grafo do EQ so existe quando ha um video, e isso e tratado no
      // playTrack.
      // O player lê isto a cada tique, dentro de um intervalo: tem de estar
      // na store e não só nas preferências.
      usePlayer.setState({ crossfadeSegundos, intensidadeSmartShuffle });
      // O `getEqGanhos` continua a ser chamado por causa da limpeza da chave
      // legada que ele faz -- devolve sempre plano. Quem manda no padrão é o
      // `getEqPadrao`, que é a definição que alguém escolheu de propósito.
      void eqGanhos;
      player._carregarAjustes({},eqPadrao,playbackRate);
      setPreferencesReady(true);
    });

    // "Manter o ecrã ligado" só era aplicado pelo useEffect do ecrã de
    // Definições. Depois de reiniciar a app o interruptor aparecia ligado
    // mas o ecrã apagava na mesma, até se visitar esse ecrã.
    getKeepAwake().then((on) => {
      // No desktop isto assenta na Wake Lock API do browser, que pode
      // recusar; falhar a manter o ecrã ligado não pode partir o arranque.
      if (on) activateKeepAwakeAsync().catch(() => {});
    });
  }, [init]);

  // Renovação automática do token do Supabase ligada ao ciclo de vida da app.
  // Sem isto, o token expira em background e as queries (com RLS) voltam
  // vazias ao regressar — "perdia" biblioteca/artistas até reiniciar. Ao
  // voltar a "active" força-se a renovação; em background pára-se o ticker.
  //
  // MENOS com música a tocar (27/9): aí o JS continua a correr no iPhone, e
  // com o ticker parado o token morria ao fim de uma hora de ecrã bloqueado.
  // Com ele morria o Realtime -- e é por lá que chegam as ordens do PC
  // ("Controlling iPhone" não fazia nada) e o resto do que é ao vivo. No PC
  // os temporizadores correm sempre (tabuleiro incluído), e renova-se sempre.
  useEffect(() => {
    const aplicar = () => {
      const precisa = Platform.OS === 'web'
        || AppState.currentState === 'active'
        || usePlayer.getState().isPlaying;
      if (precisa && !useConnectivity.getState().offline) supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };
    aplicar();
    const sub = AppState.addEventListener('change', aplicar);
    const pararDeOuvir = usePlayer.subscribe((s, p) => { if (s.isPlaying !== p.isPlaying) aplicar(); });
    return () => { sub.remove(); pararDeOuvir(); };
  }, []);

  // O relógio do sleep timer só existe quando há um timer armado. Antes a app
  // acordava uma vez por segundo durante toda a sua vida para uma função que,
  // quase sempre, devolvia imediatamente.
  useEffect(() => {
    if (!sleepTimerEndsAt) return;
    usePlayer.getState().tickSleepTimer();
    const id = setInterval(() => {
      usePlayer.getState().tickSleepTimer();
    }, 1000);
    return () => clearInterval(id);
  }, [sleepTimerEndsAt]);

  return (
    // Os gestos do leitor correm na thread da interface (3/10, Gesture Handler):
    // seguem o dedo mesmo com o JavaScript ocupado.
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/* A última rede: cada ecrã tem a sua (ver os navegadores), esta apanha
          o que rebenta fora deles. */}
      <BarreiraDeErros onde="app">
        <RootNavigator />
      </BarreiraDeErros>
      {/* "O teu mês" (7/10, substituiu o cartaz de sexta-feira). Vive AQUI, ao
          lado do `UpdateSheet`, porque é a outra coisa nesta app que se põe à
          frente de alguém sem lhe ser pedida -- e as duas têm de sobreviver à
          mudança de separador. Decide sozinho se aparece; ver
          `components/ResumoDoMes.tsx`. */}
      <ResumoDoMes />
      <UpdateSheet />
      {/* O eclipse do arranque, por cima de tudo e por isso em último. A app
          arranca por baixo enquanto ele toca. Ver `components/Abertura.tsx`. */}
      <Abertura />
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
