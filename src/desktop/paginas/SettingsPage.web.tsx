import { Revelar } from '../Revelar.web';
import { PainelDeSaude } from '../../components/PainelDeSaude';
import { souAdministrador } from '../../api/painelDeSaude';
import { RecommendationPreferences } from '../../components/RecommendationPreferences';
import { ENDERECO_DA_PRIVACIDADE, ENDERECO_DO_APOIO, ROTULOS } from '../../lib/rotulosDasDefinicoes';
import { removeOwnProfileMedia } from '../../lib/profileMedia';
import { apagarAsMinhasCapas } from '../../api/capasDasPlaylists';
/**
 * Definições do desktop, e as linhas de que é feita.
 *
 * Regra desta página, que já custou seis opções mortas: **uma opção que não
 * faz nada é pior do que não existir.** Antes de acrescentar uma, verificar
 * que ALGUÉM a lê fora deste ecrã.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_VERSION } from '../../lib/buildInfo';
import { EVENTO_PROCURAR_ATUALIZACAO } from '../../lib/avisoDeVersao';
import { checkForUpdate, PORTFOLIO_URL } from '../../lib/updates';
import { partilharRelatorioDeReproducao } from '../../lib/relatorioDeReproducao';
import { RelatarProblema } from '../../components/RelatarProblema';
import { FolhaDoListenBrainz } from '../../components/FolhaDoListenBrainz';
import { FRASES_DO_SCROBBLING } from '../../lib/scrobbling';
import { useScrobbling } from '../../state/scrobbling';
import { FRASES_DA_EXPORTACAO, nomeDoFicheiro, paraCSV, paraJSON } from '../../lib/exportarBiblioteca';
import { recolherBiblioteca } from '../../lib/recolherBiblioteca';
import { guardarExportacao } from '../../lib/guardarExportacao';
import {
  getGlitchMode, setGlitchMode, type GlitchMode,
  getEffectIntensity, setEffectIntensity, type EffectIntensity,
  getShowRewindButton, getShowTrackDuration,
  setShowRewindButton, setShowTrackDuration, setShowTrackDurationCache,
  setAutoplayRadio as persistAutoplayRadio,
  getNotificationsEnabled, setNotificationsEnabled,
  getAtualizarImportadas, setAtualizarImportadas,
} from '../../lib/prefs';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../state/auth';
import { usePlayer } from '../../state/player';
import { useTheme } from '../../state/theme';
import { styles } from '../estilos.web';
import { COR, ESP } from '../tokens.web';
import { Button, ContentScroll, Dialog, Field, Interruptor, marcar } from '../ui.web';
import { RealceDaLinha } from '../../components/RealceDaLinha';
import { NOMES_DAS_SECCOES_DO_PC, procurarDefinicoes, type DefinicaoProcuravel } from '../../lib/procuraDasDefinicoes';
import { RecuperarPassword } from '../RecuperarPassword.web';
import { BarraVelocidade } from '../BarraVelocidade.web';
import { AtalhosDoTeclado } from '../AtalhosDoTeclado.web';
import { DownloadsNasDefinicoes } from '../DownloadDaLista.web';
import { BandasDoEqualizador, ReporEqualizador } from '../PainelEqualizador.web';
import { GestorDePresets } from '../GestorDePresets.web';
import { presetsVisiveis } from '../../lib/presetsDoEqualizador';
import { ligarRecomendado, useRecomendado } from '../../state/recomendado';
import { EscolhaDoModelo, LinhaDoRecomendado } from '../RecomendadoDoEq.web';
import { usePresets } from '../../state/presets';
import { chaveDaFaixa, PLANO } from '../../lib/equalizer';
import { getCapaMetal3D, getCorNaJanela, getEcraAmbiente, setEcraAmbiente, getDiscordRichPresence, getDisposicaoDoLeitor, getDoisTons, getFundoDoLeitor, setCapaMetal3D, setCorNaJanela, setCrossfadeSegundos, setDiscordRichPresence, setDisposicaoDoLeitor, setDoisTons, setFundoDoLeitor, setIntensidadeDoSmartShuffle, type CorDoLeitor } from '../../lib/prefs';
import { lerDisposicaoEscolhida, lerFundoDoLeitor, type DisposicaoEscolhida, type FundoDoLeitor } from '../../lib/leitorDoPc';
import { definirDisposicaoDoLeitor, definirFundoDoLeitor } from '../aparenciaDoLeitor.web';
import { definirDoisTons } from '../doisTons.web';
import { definirCapaMetal } from '../CapaMetal3D.web';
import { DURACOES_DO_CROSSFADE, type DuracaoDoCrossfade } from '../../lib/crossfade';
import { efeitoDaMarcaDoRefrao, efeitoDoCrossfade, efeitoDoDiscord, efeitoDoEcraAmbiente, efeitoDoOutroAparelho, efeitoDoPadrao, efeitoDoRadio, efeitoDoRecomendado, efeitoDoSmartShuffle, efeitoDoTemporizador } from '../../lib/efeitoDasDefinicoes';
import { lerMarcaDoRefrao, ligarMarcaDoRefrao, useMarcaDoRefrao } from '../../state/refrao';
import { lerMostrarOutroAparelho, mostrarOutroAparelho, useMostrarOutroAparelho } from '../../state/outroAparelho';
import { IDIOMAS, idiomaEscolhido, lerIdioma } from '../../i18n';
import { escolherIdioma } from '../../i18n/escolher';
import { useEstadoDoDiscord } from '../../hooks/usePresencaDoDiscord';
import { usePrivacidade } from '../../state/privacidade';
import { getLibrary } from '../../api/library';
import { resumoDoVarrimento, varrerCatalogo } from '../../state/catalogoDeFaixas';
import { useConnectivity } from '../../state/connectivity';
import type { NavegarFn } from '../rotas';
import { lerDescarga, rotuloDaProcuraDeAtualizacoes, type DescargaDaAtualizacao } from '../../lib/rotuloDaAtualizacao';

import { avisarErro, avisarFeito, avisarInfo } from '../../lib/avisoDeRemocao';
import { mensagemDeErro } from '../../lib/mensagemDeErro';
export function SettingsPage({ notify, navigate }: { notify: (s: string) => void; navigate: NavegarFn }) {
  // O painel de saúde (7/10): a entrada só aparece na conta de quem gere a app.
  const contaDoPainel = useAuth((s) => s.session?.user.id ?? null);
  const [administrador, setAdministrador] = useState(false);
  const [painelAberto, setPainelAberto] = useState(false);
  // "Report a problem" (15/11): a mesma folha do iPhone.
  const [relatoAberto, setRelatoAberto] = useState(false);
  // O scrobbling (16/11, state/scrobbling.ts): direto ao ListenBrainz, deste PC.
  const [listenBrainzAberto, setListenBrainzAberto] = useState(false);
  const utilizadorDoListenBrainz = useScrobbling((s) => s.utilizador);
  // Exportar a biblioteca (16/11): no PC saem os dois ficheiros de uma vez.
  const [aExportar, setAExportar] = useState(false);
  const exportarBiblioteca = async () => {
    if (aExportar) return;
    setAExportar(true);
    avisarInfo(FRASES_DA_EXPORTACAO.aPreparar);
    try {
      const exportacao = await recolherBiblioteca();
      const agora = new Date(exportacao.exportedAt);
      await guardarExportacao(nomeDoFicheiro(agora, 'json'), paraJSON(exportacao), 'application/json');
      await guardarExportacao(nomeDoFicheiro(agora, 'csv'), paraCSV(exportacao), 'text/csv');
      avisarFeito(FRASES_DA_EXPORTACAO.feito);
    } catch (e) {
      avisarErro(mensagemDeErro(e, FRASES_DA_EXPORTACAO.falhou));
    } finally {
      setAExportar(false);
    }
  };
  useEffect(() => { let vivo = true; void souAdministrador(contaDoPainel).then((v) => { if (vivo) setAdministrador(v); }); return () => { vivo = false; }; }, [contaDoPainel]);
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
      setResumoDoCatalogo("Couldn't finish. Check your connection and try again.");
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
    catch (e: any) { avisarErro(mensagemDeErro(e, "Couldn't change Windows startup.")); }
    finally { setSavingStartup(false); }
  };
  const changeCloseToTray = async (enabled: boolean) => {
    const anterior = closeToTray;
    setCloseToTray(enabled);
    try { await window.duotoneDesktop?.setCloseToTray?.(enabled); }
    catch (e: any) {
      setCloseToTray(anterior);
      avisarErro(mensagemDeErro(e, "Couldn't change the Close button behaviour."));
    }
  };
  const [duration, setDurationState] = useState(true);
  const [rewind, setRewindState] = useState(false);
   const [opacity, setOpacity] = useState('0.72');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // A conta (27/9): o "Sign out", o "Reset password" e o email viviam no perfil
  // antigo e sumiram quando ele passou a ser o SocialProfileView (3/9) -- o PC
  // ficou sem porta para sair da conta. Agora é a secção Account, como no iPhone.
  const email = useAuth((s) => s.session?.user?.email ?? null);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  // A palavra-passe muda-se com um código por email (22/11): o link antigo abria o
  // localhost:3000 do painel do Supabase, onde não corre nada.
  const [aRepor, setARepor] = useState(false);
  const [seccao, setSeccao] = useState<IdDaSeccao>(seccaoAberta);
  const [estreita, setEstreita] = useState(false);
  const [doisTons, setDoisTonsState] = useState(false);
  useEffect(() => { void getDoisTons().then(setDoisTonsState); }, []);
  const [capaMetal, setCapaMetalState] = useState(false);
  useEffect(() => { void getCapaMetal3D().then(setCapaMetalState); }, []);
  // O ecrã ambiente (25/11): só na casca em Tauri, que é quem põe o ecrã inteiro sem gesto.
  const temAmbiente = !!window.duotoneDesktop?.ecraAmbiente;
  const [ecraAmbiente, setEcraAmbienteState] = useState(true);
  useEffect(() => { void getEcraAmbiente().then(setEcraAmbienteState); }, []);
  const mudarEcraAmbiente = (v: boolean) => {
    setEcraAmbienteState(v);
    void setEcraAmbiente(v);
    window.dispatchEvent(new CustomEvent('duotone:ecra-ambiente', { detail: v }));
  };
  // O layout e o fundo do Now Playing (5/11): o Classic e a capa de origem.
  const [disposicao, setDisposicaoState] = useState<DisposicaoEscolhida>('classico');
  useEffect(() => { void getDisposicaoDoLeitor().then(setDisposicaoState); }, []);
  const [fundo, setFundoState] = useState<FundoDoLeitor>('capa');
  useEffect(() => { void getFundoDoLeitor().then(setFundoState); }, []);
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
  // O download da versão nova, a andar (20/10): a procura e o download são a
  // mesma operação, e sem isto a linha ficava em "Checking for updates…" os
  // minutos todos do download. Pergunta-se ao abrir (pode já ir a meio).
  const [descarga, setDescarga] = useState<DescargaDaAtualizacao | null>(null);
  useEffect(() => {
    const ponte = window.duotoneDesktop;
    if (!ponte?.onDescargaDaAtualizacao) return;
    let vivo = true;
    void ponte.descargaDaAtualizacao?.().then((d) => { if (vivo) setDescarga(lerDescarga(d)); }).catch(() => {});
    const largar = ponte.onDescargaDaAtualizacao((d) => setDescarga(lerDescarga(d)));
    return () => { vivo = false; largar(); };
  }, []);

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
  /** A casca em Tauri não tem Discord (o João tirou-o a 22/11): a opção só
   * aparece onde a casca o publica, para não ficar um interruptor que nada faz. */
  const temDiscord=!!window.duotoneDesktop?.definirPresencaNoDiscord;
  const padraoGanhos = usePlayer((s) => s.padraoGanhos);
  const memoriaDosPresets = usePresets((s) => s.memoria);
  const presetsNaFila = useMemo(() => presetsVisiveis(memoriaDosPresets), [memoriaDosPresets]);
  const setEqGanhos = usePlayer((s) => s.setEqGanhos);
  // O Recommended como EQ padrão (25/10): mostra a curva dele, e qualquer
  // outra escolha (um preset, uma banda, o Reset) passa a ser o padrão e
  // desliga-o.
  const recomendadoLigado = useRecomendado((s) => s.ligado);
  const recomendacao = useRecomendado((s) => s.recomendacao);
  const mudarOPadrao = (g: number[]) => { setEqGanhos(g, true); ligarRecomendado(false); };
  const [aEscolherModelo, setAEscolherModelo] = useState(false);
  const setPlaybackRate = usePlayer((s) => s.setPlaybackRate);
  // Vem já carregado da store (App.tsx lê a preferência no arranque nas duas
  // plataformas), por isso não precisa de entrar no Promise.all acima.
  const autoplayRadio = usePlayer((s) => s.autoplayRadio);
  // A store e o ticker de 1s do App.tsx ja corriam no desktop; faltava so a UI.
  const sleepLeft = usePlayer((s) => s.sleepTimerTimeLeft);
  const pararNoFimDaFaixa = usePlayer((s) => s.pararNoFimDaFaixa);
  const sleepChoice = pararNoFimDaFaixa ? 'fim' : sleepLeft === 0 ? '0'
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
  // A risca do refrão na barra do leitor (25/10, desligada de origem).
  const marcaDoRefrao = useMarcaDoRefrao((s) => s.ligada);
  useEffect(lerMarcaDoRefrao, []);
  // O iPhone a tocar (15/11): o aviso e o botão da barra. Ligada de origem.
  const mostrarOutro = useMostrarOutroAparelho((s) => s.mostrar);
  useEffect(lerMostrarOutroAparelho, []);
  const efeitos = {
    refrao: efeitoDaMarcaDoRefrao({ ligada: marcaDoRefrao }),
    outroAparelho: efeitoDoOutroAparelho({ mostrar: mostrarOutro, outro: 'iPhone' }),
    smart: efeitoDoSmartShuffle({ intensidade: intensidadeSmart, ligado: smartLigado }),
    discord: efeitoDoDiscord({ ligado: discordOn, privada, estado: estadoDoDiscord }),
    radio: efeitoDoRadio({ ligado: autoplayRadio, aTocarRadio: radioActivo }),
    temporizador: efeitoDoTemporizador({ restanteS: sleepLeft, agora: new Date(), noFimDaFaixa: pararNoFimDaFaixa }),
    crossfade: efeitoDoCrossfade({ segundos: crossfade, repeatUma }),
    ambiente: efeitoDoEcraAmbiente(ecraAmbiente),
    velocidade: efeitoDoPadrao({
      tipo: 'velocidade', temFaixa: !!atual,
      temAjusteProprio: !!ajusteDaFaixa && ajusteDaFaixa.rate !== null,
      igualAoPadrao: Math.abs(rateDaFaixa - padraoRate) < 0.005,
      valorDaFaixa: `${Number(rateDaFaixa.toFixed(2))}×`,
    }),
    equalizador: recomendadoLigado ? efeitoDoRecomendado({ modelo: recomendacao.modelo }) : efeitoDoPadrao({
      tipo: 'equalizador', temFaixa: !!atual,
      temAjusteProprio: !!ajusteDaFaixa && ajusteDaFaixa.ganhos !== null,
      igualAoPadrao: ganhosDaFaixa.length === padraoGanhos.length
        && ganhosDaFaixa.every((g, i) => Math.abs(g - padraoGanhos[i]) < 0.05),
    }),
  };

  // As playlists importadas a atualizar-se sozinhas (10/11): ligado de origem.
  const [atualizarImportadas, setAtualizarImportadasEstado] = useState(true);
  useEffect(() => { void getAtualizarImportadas().then(setAtualizarImportadasEstado); }, []);

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

  // Diagnostico de reproducao: o texto monta-se em lib/relatorioDeReproducao.web.ts
  // (15/11), o mesmo que o "Report a problem" junta ao relato.
  const exportarRelatorio = async () => {
    await partilharRelatorioDeReproducao();
    notify('Playback report saved.');
  };

  const runDeleteAccount = async () => {
    try {
      await removeOwnProfileMedia();
      await apagarAsMinhasCapas();
      const { error } = await supabase.rpc('delete_user_account');
      if (error) throw error;
      setDeleteConfirm(false);
      notify('Your account has been deleted.');
      useAuth.getState().signOut();
    } catch (e: any) {
      avisarErro(mensagemDeErro(e, "Couldn't delete your account."));
    }
  };

  // Na app instalada, o aviso de versão instala sozinho ("Update now"); no
  // browser não há ponte, e fica o download pelo site.
  const instalaNaApp = typeof window !== 'undefined' && !!window.duotoneDesktop?.instalarAtualizacao;
  const checkForUpdates = async () => {
    // A app instalada atualiza-se sozinha (27/9): procurar agora só adianta o
    // download. A versão nova instala-se quando nada toca há dez minutos e a
    // janela está no tabuleiro (ou o PC sem uso), ou na próxima abertura (11/11).
    const ponte = window.duotoneDesktop;
    if (ponte?.procurarAtualizacao) {
      setCheckingUpdate(true);
      try {
        const r = await ponte.procurarAtualizacao();
        if (r?.estado === 'pronta') notify(`Duotone ${r.versao} is ready. It installs by itself when you're not listening.`);
        else if (r?.estado === 'atual') avisarInfo(`Duotone ${APP_VERSION} is up to date.`);
        else avisarErro("Couldn't check for updates. Check your connection and try again.");
      } finally {
        setCheckingUpdate(false);
      }
      return;
    }
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
        avisarInfo(`Duotone ${release.latest} is available.`);
        window.dispatchEvent(new CustomEvent(EVENTO_PROCURAR_ATUALIZACAO));
      } else {
        avisarInfo(`Duotone ${APP_VERSION} is up to date.`);
      }
    } catch {
      avisarErro("Couldn't check for updates. Check your connection and try again.");
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
  // Mudar de secção (24/11, a lista "Refinar o PC"): o cartão novo entra (`seccao-entra`,
  // na casca) em vez de trocar no mesmo fotograma. Ao abrir as Definições não: a página já entra.
  const [mudouDeSeccao, setMudouDeSeccao] = useState(false);
  const escolher = (id: IdDaSeccao) => { seccaoAberta = id; setSeccao(id); setMudouDeSeccao(true); };
  // A procura (27/11, `lib/procuraDasDefinicoes.ts`): o João não encontrou o "Ambient
  // full screen". Com texto, os resultados ficam no lugar das secções; escolher um
  // abre a secção dele e acende a linha 1,8 s.
  const [procura, setProcura] = useState('');
  const encontradas = useMemo(() => procurarDefinicoes(procura, 'pc')
    .filter((d) => seccoes.some((x) => x.id === d.pc)), [procura, seccoes]);
  const [realce, setRealce] = useState<string | null>(null);
  const irParaDefinicao = (d: DefinicaoProcuravel) => {
    setProcura('');
    escolher(d.pc!);
    setRealce(d.rotulo);
    setTimeout(() => setRealce((r) => (r === d.rotulo ? null : r)), 1800);
  };

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
              <Field icon="search" placeholder="Search settings" value={procura} onChangeText={setProcura} accessibilityLabel="Search settings"
                style={{ minWidth: 0 }} />
              {procura.trim() ? (encontradas.length ? encontradas.map((d) => (
                <Pressable key={d.rotulo} onPress={() => irParaDefinicao(d)} accessibilityRole="button"
                  accessibilityLabel={`${d.rotulo}, in ${NOMES_DAS_SECCOES_DO_PC[d.pc!]}`}
                  style={({ hovered }: any) => [styles.definicoesItem, hovered && styles.definicoesItemHover, { flexDirection: 'column', alignItems: 'flex-start', gap: 1 }]}>
                  <Text style={[styles.definicoesItemTexto, { color: COR.texto }]}>{d.rotulo}</Text>
                  <Text style={styles.settingDescription}>{NOMES_DAS_SECCOES_DO_PC[d.pc!]}</Text>
                </Pressable>
              )) : <Text style={[styles.settingDescription, { paddingHorizontal: ESP.sm }]}>No settings match.</Text>) : null}
              {procura.trim() ? null : seccoes.map((s) => (
                <Pressable key={s.id} onPress={() => escolher(s.id)} accessibilityRole="tab" accessibilityState={{ selected: aberta === s.id }}
                  style={({ hovered }: any) => [styles.definicoesItem, hovered && styles.definicoesItemHover, aberta === s.id && styles.definicoesItemAtivo]}>
                  <Ionicons name={s.icone} size={17} color={aberta === s.id ? COR.texto : COR.textoFraco} />
                  <Text style={[styles.definicoesItemTexto, aberta === s.id && { color: COR.texto }]}>{s.nome}</Text>
                </Pressable>
              ))}
            </View>
            <RealceDaLinha.Provider value={realce}>
            <View key={aberta} {...(mudouDeSeccao ? marcar('seccao-entra') : {})} style={styles.definicoesPainel}>
              {aberta === 'reproducao' && <SettingsCard title="Playback">
                {/* Quantas músicas novas o Smart Shuffle mete (26/9). */}
                <ChoiceLine label={ROTULOS.smartShuffle} description="How many new songs it adds to what you're playing."
                  value={intensidadeSmart} choices={[['poucas', 'Few'], ['normal', 'Some'], ['muitas', 'Lots']]}
                  onChange={(v) => { const i = v as 'poucas' | 'normal' | 'muitas'; usePlayer.setState({ intensidadeSmartShuffle: i }); void setIntensidadeDoSmartShuffle(i); }}
                  efeito={efeitos.smart} />
                {/* O crossfade do PC (24/9): um segundo player do YouTube prepara a
                    seguinte, calado, e os volumes cruzam-se no fim -- ver o
                    YouTubePlayerView.web.tsx. Desligado de origem, como no iPhone. */}
                <ChoiceLine label={ROTULOS.crossfade} description="Blend the end of a song into the next one."
                  value={String(crossfade)} choices={DURACOES_DO_CROSSFADE.map((d) => [String(d), d === 0 ? 'Off' : `${d} s`] as [string, string])}
                  onChange={(v) => { const d = Number(v) as DuracaoDoCrossfade; usePlayer.setState({ crossfadeSegundos: d }); void setCrossfadeSegundos(d); }}
                  efeito={efeitos.crossfade} />
                <ToggleLine label={ROTULOS.autoplay} description="When the queue ends, keep playing music like it instead of stopping." value={autoplayRadio} onChange={(v) => { usePlayer.getState().setAutoplayRadio(v); persistAutoplayRadio(v); }} efeito={efeitos.radio} />
                <ToggleLine label={ROTULOS.refraoNaBarra} description="A thin mark where the chorus starts." value={marcaDoRefrao} onChange={ligarMarcaDoRefrao} efeito={efeitos.refrao} />
                <ChoiceLine label={ROTULOS.temporizador} value={sleepChoice} choices={[['0', 'Off'], ['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '60 min'], ['fim', 'End of track']]} onChange={(v) => (v === 'fim' ? usePlayer.getState().setSleepTimerNoFimDaFaixa() : usePlayer.getState().setSleepTimer(Number(v)))} efeito={efeitos.temporizador} />
                <View style={[styles.settingLine, { flexDirection: 'column', alignItems: 'stretch', gap: ESP.md }]}>
                  <View>
                    <Text style={styles.settingLabel}>{ROTULOS.velocidade}</Text>
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
                      <Text style={styles.settingLabel}>{ROTULOS.equalizador}</Text>
                      <Text style={styles.settingDescription}>This PC's default, for songs you haven't set on their own. The iPhone has its own. The one playing changes on the next song.</Text>
                      <Efeito texto={efeitos.equalizador} />
                    </View>
                    <ReporEqualizador aoRepor={() => mudarOPadrao(PLANO.slice())} />
                  </View>
                  {aEscolherModelo ? <EscolhaDoModelo aoFechar={() => setAEscolherModelo(false)} /> : (
                    <BandasDoEqualizador
                      ganhos={recomendadoLigado ? recomendacao.ganhos : padraoGanhos}
                      aoMudarGanhos={mudarOPadrao}
                      presets={presetsNaFila}
                      recomendado={{
                        escolhido: recomendadoLigado,
                        aoEscolher: () => ligarRecomendado(true),
                        linha: <LinhaDoRecomendado aoEscolherModelo={() => setAEscolherModelo(true)} />,
                      }}
                    />
                  )}
                </View>
                <GestorDePresets ganhosIniciais={padraoGanhos} />
              </SettingsCard>}

              {aberta === 'aspeto' && <SettingsCard title="Appearance">
                {/* A língua (15/11, src/i18n): o que já está escrito só muda de língua ao recarregar. */}
                <ChoiceLine label={ROTULOS.idioma} description="Duotone reloads to switch."
                  value={idiomaEscolhido()} choices={IDIOMAS.map(([id, nome]) => [id, nome] as [string, string])}
                  onChange={(v) => escolherIdioma(lerIdioma(v))} />
                {/* O layout e o fundo do Now Playing (5/11): o Classic e a capa de origem, e muda ao vivo. */}
                <ChoiceLine label="Now Playing layout" description="Classic shows the big artwork. Cinema fills the window and puts a large title on the left." value={disposicao} choices={[['classico', 'Classic'], ['cinema', 'Cinema']]} onChange={(v) => { const d = lerDisposicaoEscolhida(v); setDisposicaoState(d); definirDisposicaoDoLeitor(d); void setDisposicaoDoLeitor(d); }} />
                <ChoiceLine label="Now Playing background" description="Use the blurred artwork, or the artist's photo when there is one." value={fundo} choices={[['capa', 'Artwork'], ['artista', 'Artist photo']]} onChange={(v) => { const f = lerFundoDoLeitor(v); setFundoState(f); definirFundoDoLeitor(f); void setFundoDoLeitor(f); }} />
                {/* O Cinema não tem a capa grande: o efeito e a capa de metal não fariam nada lá. */}
                {/* A captura de audio e dita aqui, nao escondida: e o que permite
                    o efeito reagir ao som, e desligar a opcao desliga-a mesmo. */}
                <Revelar aberto={disposicao !== 'cinema'}>{() => <ChoiceLine label="Now Playing effect" description="Reactive follows the music. Static freezes it. Off shows the plain artwork." value={glitch} choices={[['reactive', 'Reactive'], ['static', 'Static'], ['off', 'Off']]} onChange={changeGlitch} />}</Revelar>
                <Revelar aberto={disposicao !== 'cinema' && glitch !== 'off'}>{() => <ChoiceLine label="Effect strength" value={effectIntensity} choices={[['subtle', 'Subtle'], ['normal', 'Normal'], ['strong', 'Strong']]} onChange={changeEffectIntensity} />}</Revelar>
                {/* A capa de metal em 3D (5/11): desligada de origem. */}
                <Revelar aberto={disposicao !== 'cinema'}>{() => <ToggleLine label="3D cover" description="Show the Now Playing artwork as a 3D block that sinks where your mouse is, with light running along its edges. Drag it sideways to turn it to the lyrics." value={capaMetal} onChange={(v) => { setCapaMetalState(v); definirCapaMetal(v); void setCapaMetal3D(v); }} />}</Revelar>
                {/* A cor da capa a encher a janela (26/9); a de origem. */}
                <ChoiceLine label="Now Playing colour" description="Let the artwork's colour (and an artist's photo) fill the whole window, or keep it inside the page." value={corDoLeitor} choices={[['janela', 'Whole window'], ['pagina', 'Page only']]} onChange={mudarCorDoLeitor} />
                {/* As capas a dois tons (30/10): desligadas de origem. */}
                <ToggleLine label="Two-tone covers" description="Show covers on shelves and grids in two tones until you hover them or keep the song." value={doisTons} onChange={(v) => { setDoisTonsState(v); definirDoisTons(v); void setDoisTons(v); }} />
                <ChoiceLine label={ROTULOS.acento} value={modo} choices={[['steel', 'Steel'], ['cover', 'Follow the cover']]} onChange={(v) => void setMode(v as any)} />
                <ChoiceLine label="Window" value={opacity} choices={[['0.95', 'Solid'], ['0.72', 'Default'], ['0.55', 'Translucent'], ['0.35', 'Clear']]} onChange={changeOpacity} />
                <ToggleLine label={ROTULOS.duracao} description="Show a time column in track lists." value={duration} onChange={(v) => { setDurationState(v); setShowTrackDuration(v); setShowTrackDurationCache(v); }} />
                <ToggleLine label={ROTULOS.recuo} description="Show a rewind button in the player." value={rewind} onChange={(v) => { setRewindState(v); setShowRewindButton(v); usePlayer.getState().setShowRewindButton(v); }} />
              </SettingsCard>}

              {aberta === 'windows' && <SettingsCard title="Windows">
                <ToggleLine label={ROTULOS.mensagens} description="Show a Windows notification when a message arrives while you are away."
                  value={notifications} onChange={(v) => { setNotifications(v); void setNotificationsEnabled(v); }} />
                <ToggleLine label={ROTULOS.outroAparelhoNoPc}
                  description="A notice and a button in the player bar when your iPhone is playing, to continue here."
                  value={mostrarOutro} onChange={mostrarOutroAparelho} efeito={efeitos.outroAparelho} />
                {temAmbiente && <ToggleLine label={ROTULOS.ecraAmbiente}
                  description="When music is playing and you leave Duotone alone for a minute, it fills its screen. Move the mouse over it to come back."
                  value={ecraAmbiente} onChange={mudarEcraAmbiente} efeito={efeitos.ambiente} />}
                {window.duotoneDesktop?.setCloseToTray && <ToggleLine
                  label="Close to tray"
                  description="Keep playing in the system tray when you close the window."
                  value={closeToTray} onChange={(v) => void changeCloseToTray(v)} />}
                {startup?.available && <>
                  <ToggleLine label="Start with Windows" description="Open Duotone when you sign in to Windows."
                    value={startup.enabled} onChange={(v) => void changeStartup(v, startup.mode)} />
                  <Revelar aberto={startup.enabled}>{() => <ChoiceLine label="Start in" value={startup.mode} choices={[[ 'tray', 'System tray' ], [ 'window', 'Window' ]]}
                    onChange={(v) => void changeStartup(startup.enabled, v as 'window' | 'tray')} />}</Revelar>
                </>}
                {/* Desligada de origem: publica o que se ouve. A aplicação oficial
                    fica embutida; pedir um client id a cada pessoa impedia o Join,
                    porque todos os participantes têm de usar a mesma aplicação. */}
                {temDiscord && <ToggleLine label="Discord status"
                  description="Show what you're listening to on Discord. Friends can join your Jam from there."
                  value={discordOn} onChange={(v)=>{setDiscordOn(v);void setDiscordRichPresence(v);avisarDiscord(v);}}
                  efeito={efeitos.discord} />}
              </SettingsCard>}

              {aberta === 'atalhos' && <SettingsCard title="Keyboard shortcuts">
                <AtalhosDoTeclado />
              </SettingsCard>}

              {/* A biblioteca: o artista e o título vêm adivinhados do título do
                  vídeo, e um catálogo a sério corrige-os; o Library check trata
                  dos duplicados, dos vídeos que já não tocam e das capas partidas.
                  Nenhum dos dois corre sozinho. */}
              {aberta === 'biblioteca' && <SettingsCard title="Library">
                <DownloadsNasDefinicoes />
                <View style={styles.settingLine}>
                  <View style={{ flex: 1, paddingRight: ESP.lg }}>
                    <Text style={styles.settingLabel}>{ROTULOS.recomendacoes}</Text>
                    <Text style={styles.settingDescription}>Songs you hid and artists you want to hear less often.</Text>
                  </View>
                  <Button secondary onPress={() => setRecommendationsOpen(true)}>Manage</Button>
                </View>
                <View style={styles.settingLine}>
                  <View style={{ flex: 1, paddingRight: ESP.lg }}>
                    <Text style={styles.settingLabel}>{ROTULOS.identificar}</Text>
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
                    <Text style={styles.settingLabel}>{ROTULOS.libraryCheck}</Text>
                    <Text style={styles.settingDescription}>Find songs saved twice, videos that no longer play and covers that don't load.</Text>
                  </View>
                  <Button secondary onPress={() => navigate({ name: 'library-check' })}>Open</Button>
                </View>
                <View style={styles.settingLine}>
                  <View style={{ flex: 1, paddingRight: ESP.lg }}>
                    <Text style={styles.settingLabel}>{ROTULOS.exportarBiblioteca}</Text>
                    <Text style={styles.settingDescription}>A copy of your Liked Songs, playlists and saved albums, as JSON and CSV.</Text>
                  </View>
                  <Button secondary onPress={() => void exportarBiblioteca()} ocupado={aExportar} disabled={aExportar}>Export</Button>
                </View>
                <ToggleLine label={ROTULOS.atualizarImportadas} description="Playlists you imported from a link pick up the songs added there since, once a day when you open them."
                  value={atualizarImportadas} onChange={(v) => { setAtualizarImportadasEstado(v); void setAtualizarImportadas(v); }} />
                <LinhaDaContaDoSpotify navigate={navigate} />
              </SettingsCard>}

              {aberta === 'sobre' && <SettingsCard title="About">
                {/* Vem do buildInfo.ts, que a CI reescreve a cada build (build-windows.yml). */}
                <SettingLine label={ROTULOS.versao} value={APP_VERSION} />
                {window.duotoneDesktop?.atualizacaoAutomatica ? <Text style={[styles.settingDescription, { paddingHorizontal: 17, paddingBottom: 10, marginTop: 0 }]}>Updates download by themselves and install while Duotone is in the tray and nothing is playing, or the next time it opens.</Text> : null}
                <SettingAction
                  label={rotuloDaProcuraDeAtualizacoes({ descarga, versaoNova: update?.version ?? null, instalaNaApp, aProcurar: checkingUpdate })}
                  onPress={() => { if (!checkingUpdate) void checkForUpdates(); }}
                />
                <SettingAction label={ROTULOS.apoiar} description="Duotone is free. Donations keep its server running." onPress={() => { window.open(ENDERECO_DO_APOIO, '_blank', 'noopener,noreferrer'); }} />
                <SettingAction label={ROTULOS.privacidade} description="What Duotone stores, who can see it, and how to delete it." onPress={() => { window.open(ENDERECO_DA_PRIVACIDADE, '_blank', 'noopener,noreferrer'); }} />
                <SettingAction label={FRASES_DO_SCROBBLING.titulo}
                  description={utilizadorDoListenBrainz ? FRASES_DO_SCROBBLING.ligado(utilizadorDoListenBrainz) : 'Send what you listen to ListenBrainz, straight from this PC. Songs count at half their length, or four minutes.'}
                  onPress={() => setListenBrainzAberto(true)} />
                <SettingAction label={ROTULOS.relatarProblema} description="Tell the developer what went wrong. The playback report can go with it." onPress={() => setRelatoAberto(true)} />
                <SettingAction label="Save playback report" description="If a song won't play, or Duotone feels heavy, send this so it can be fixed." onPress={() => { avisarInfo('Preparing the report…'); void exportarRelatorio(); }} />
                {/* Só na conta do João (7/10, supabase/painel-de-saude.sql). */}
                {administrador ? <SettingAction label="App health" description="Who is on which version, failed songs, crashes and time to first sound, from everyone's app." onPress={() => setPainelAberto(true)} /> : null}
              </SettingsCard>}
              <PainelDeSaude visivel={painelAberto} aoFechar={() => setPainelAberto(false)} />
              <RelatarProblema visible={relatoAberto} onClose={() => setRelatoAberto(false)} />
              <Dialog open={aRepor} title={ROTULOS.reporPassword} onClose={() => setARepor(false)}>
                <RecuperarPassword emailInicial={email ?? ''} emailFixo rotuloDoVoltar="Cancel" aoVoltar={() => setARepor(false)}
                  aoMudar={() => { setARepor(false); notify('Password changed.'); }} />
              </Dialog>
              <FolhaDoListenBrainz visible={listenBrainzAberto} onClose={() => setListenBrainzAberto(false)} />

              {/* As mesmas três coisas da secção Account do iPhone, e o apagar a
                  conta, que vivia no About. Sem rede, como lá, ficam apagadas. */}
              {aberta === 'conta' && <SettingsCard title="Account">
                {offline ? <Text style={[styles.settingDescription, { paddingHorizontal: 17, paddingTop: 10, marginTop: 0 }]}>Offline · connect to manage your account.</Text> : null}
                <SettingLine label={ROTULOS.email} value={email ?? '—'} />
                <SettingAction label={ROTULOS.reporPassword} description="We'll email you a code to choose a new one." disabled={offline} onPress={() => setARepor(true)} />
                <SettingAction label={ROTULOS.sair} description="Stops the music and clears the queue on this computer." onPress={() => setSignOutConfirm(true)} />
                <SettingAction danger label={ROTULOS.apagarConta} disabled={offline} onPress={() => setDeleteConfirm(true)} />
              </SettingsCard>}
            </View>
            </RealceDaLinha.Provider>
          </View>
        </View>
      </ContentScroll>
      <Dialog open={deleteConfirm} title="Delete account permanently?" onClose={() => setDeleteConfirm(false)}>
        <Text style={styles.dialogBody}>Your account and all profile data will be permanently deleted. This cannot be undone.</Text>
        <View style={styles.dialogActions}>
          <Button secondary onPress={() => setDeleteConfirm(false)}>Cancel</Button>
          <Button danger onPress={runDeleteAccount}>Delete account</Button>
        </View>
      </Dialog>
      <Dialog open={signOutConfirm} title="Sign out?" onClose={() => setSignOutConfirm(false)}>
        {email ? <Text style={styles.dialogBody}>{email}</Text> : null}
        <View style={styles.dialogActions}>
          <Button secondary onPress={() => setSignOutConfirm(false)}>Cancel</Button>
          <Button danger onPress={() => { setSignOutConfirm(false); void useAuth.getState().signOut(); }}>Sign out</Button>
        </View>
      </Dialog>
    </View>
  );
}

type IdDaSeccao = 'reproducao' | 'som' | 'aspeto' | 'windows' | 'atalhos' | 'biblioteca' | 'conta' | 'sobre';
const SECCOES: { id: IdDaSeccao; nome: string; icone: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'reproducao', nome: 'Playback', icone: 'play-circle-outline' },
  { id: 'som', nome: 'Sound', icone: 'options-outline' },
  { id: 'aspeto', nome: 'Appearance', icone: 'color-palette-outline' },
  { id: 'windows', nome: 'Windows', icone: 'desktop-outline' },
  { id: 'atalhos', nome: 'Shortcuts', icone: 'keypad-outline' },
  { id: 'biblioteca', nome: 'Library', icone: 'library-outline' },
  { id: 'conta', nome: 'Account', icone: 'person-circle-outline' },
  { id: 'sobre', nome: 'About', icone: 'information-circle-outline' },
];
/** A secção aberta sobrevive a sair e voltar às Definições. */
let seccaoAberta: IdDaSeccao = 'reproducao';
/** A paleta do Ctrl+F abre as Definições numa secção (26/11, "Open Sound settings"). */
export function definirSeccaoDasDefinicoes(id: IdDaSeccao): void { seccaoAberta = id; }

export function SettingsCard({ title, children }: { icon?: keyof typeof Ionicons.glyphMap; title: string; children: ReactNode }) { return <View style={styles.settingsCard}><View style={styles.settingsCardTitle}><Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>; }

export function SettingLine({ label, value }: { label: string; value: string }) { const acesa = useContext(RealceDaLinha) === label; return <View style={[styles.settingLine, acesa && styles.settingAcesa]}><Text style={[styles.settingLabel, { flex: 1 }]}>{label}</Text><Text numberOfLines={1} style={styles.settingValue}>{value}</Text></View>; }

export function SettingAction({ label, description, onPress, danger = false, disabled = false }: { label: string; description?: string; onPress: () => void; danger?: boolean; disabled?: boolean }) { const acesa = useContext(RealceDaLinha) === label; return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }} style={({ hovered }) => [styles.settingLine, hovered && !disabled && styles.settingHover, disabled && { opacity: 0.45 }, acesa && styles.settingAcesa]}><View style={{ flex: 1 }}><Text style={[styles.settingLabel, danger && { color: COR.erro }]}>{label}</Text>{description ? <Text style={styles.settingDescription}>{description}</Text> : null}</View><Ionicons name="chevron-forward" size={15} color={COR.textoFraco} /></Pressable>; }

/**
 * O que a opção está a fazer agora (lib/efeitoDasDefinicoes.ts), por baixo da
 * descrição: a descrição diz a regra, isto diz o momento.
 */
export function Efeito({ texto }: { texto?: string | null }) { if (!texto) return null; return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: COR.texto, opacity: 0.6 }} /><Text style={{ color: COR.texto, fontSize: 12, lineHeight: 17, flex: 1 }}>{texto}</Text></View>; }

export function ToggleLine({ label, description, value, onChange, efeito }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void; efeito?: string | null }) { const acesa = useContext(RealceDaLinha) === label; return <View style={[styles.settingLine, acesa && styles.settingAcesa]}><View style={{ flex: 1 }}><Text style={styles.settingLabel}>{label}</Text><Text style={styles.settingDescription}>{description}</Text><Efeito texto={efeito} /></View><Interruptor accessibilityLabel={label} value={value} onValueChange={onChange} /></View>; }

export function ChoiceLine({ label, description, value, choices, onChange, efeito }: { label: string; description?: string; value: string; choices: [string, string][]; onChange: (v: string) => void; efeito?: string | null }) { const acesa = useContext(RealceDaLinha) === label; return <View style={[styles.settingLine, { alignItems: 'flex-start' }, acesa && styles.settingAcesa]}><View style={{ flex: 1, marginTop: 8, paddingRight: ESP.md }}><Text style={styles.settingLabel}>{label}</Text>{description ? <Text style={styles.settingDescription}>{description}</Text> : null}<Efeito texto={efeito} /></View><View style={styles.smallSegment}>{choices.map(([id, text]) => <Pressable key={id} onPress={() => onChange(id)} style={[styles.smallSegmentItem, value === id && styles.smallSegmentActive]}><Text style={[styles.smallSegmentText, value === id && { color: COR.texto }]}>{text}</Text></Pressable>)}</View></View>; }

/**
 * A conta do Spotify nas Definições (11/11, pedido do João). O login e a
 * leitura vivem no processo principal (`electron/contaDoSpotify.cjs`); daqui
 * liga-se, vai-se escolher o que importar, ou desliga-se. Fora do Electron não
 * aparece.
 */
function LinhaDaContaDoSpotify({ navigate }: { navigate: NavegarFn }) {
  const ponte = typeof window !== 'undefined' ? window.duotoneDesktop : undefined;
  const [ligada, setLigada] = useState<boolean | null>(null);
  const [aEntrar, setAEntrar] = useState(false);
  useEffect(() => {
    let vivo = true;
    void ponte?.spotifyLigado?.().then((l) => { if (vivo) setLigada(l); }, () => { if (vivo) setLigada(false); });
    return () => { vivo = false; };
  }, [ponte]);
  if (!ponte?.spotifyLigado) return null;
  const entrar = async () => {
    setAEntrar(true);
    try {
      if (await ponte.entrarNoSpotify?.()) { setLigada(true); navigate({ name: 'import' }); }
    } catch {
      avisarErro("Couldn't open the Spotify login.");
    } finally {
      setAEntrar(false);
    }
  };
  const sair = async () => {
    await ponte.sairDoSpotify?.().catch(() => {});
    setLigada(false);
    avisarFeito('Spotify disconnected', 'Duotone no longer keeps your Spotify login.');
  };
  return (
    <View style={styles.settingLine}>
      <View style={{ flex: 1, paddingRight: ESP.lg }}>
        <Text style={styles.settingLabel}>{ROTULOS.contaDoSpotify}</Text>
        <Text style={styles.settingDescription}>
          {ligada ? 'Connected. Bring your Liked Songs and playlists, or disconnect.' : 'Log in to bring your Liked Songs and playlists, private ones too.'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: ESP.sm }}>
        {ligada ? (
          <>
            <Button secondary onPress={() => navigate({ name: 'import' })}>Import</Button>
            <Button secondary onPress={() => void sair()}>Disconnect</Button>
          </>
        ) : (
          <Button secondary ocupado={aEntrar} disabled={ligada === null} onPress={() => void entrar()}>{aEntrar ? 'Waiting…' : 'Connect'}</Button>
        )}
      </View>
    </View>
  );
}
