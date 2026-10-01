import { AppState, Platform } from 'react-native';
import { appEstaVisivel } from './appVisibility';
import { segundosSemInteracao } from './inatividadeDoSistema';
import { contaComoAtivo, estaAoComputador } from './presencaAtiva';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { getDeviceId } from './deviceIdentity';
import { usePlayer } from '../state/player';
import { garantirPrivacidade, usePrivacidade } from '../state/privacidade';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { proximasParaAPresenca, posicaoProjetada } from './seguirAmigo';

let terminarAtual: (() => Promise<void>) | null = null;
// O servidor mantém cada publicação válida por 120 s. Setenta e cinco deixa
// margem confortável para rede lenta e quase reduz a metade os batimentos que
// antes saíam de 45 em 45 segundos.
const PRESENCE_PUBLISH_MS=75_000;
// No PC com a janela escondida e sem som há mais de 5 min, o Chromium só acorda
// os temporizadores de minuto a minuto: um batimento de 75 s corria aos 120,
// colado ao fim da validade do servidor, e o online piscava. A 50 s corre aos
// 60. Custo: ~60-72 publicações por hora, só enquanto a pessoa mexe no PC com o
// Duotone escondido e parado (ausente, não sai nenhuma).
const BATIMENTO_ESCONDIDO_NO_PC_MS=50_000;
export async function terminarPresenca(): Promise<void> { await terminarAtual?.(); }

/** Onde vai a música agora, para quem te segue. Só projeta com ela a soar. */
function posicaoAgoraParaAPresenca(): number {
  const s = usePlayer.getState();
  return posicaoProjetada({
    positionMs: s.positionMs,
    positionAt: s.positionAt,
    aSoar: s.isPlaying && s.playbackConfirmed && !s.buffering,
    ritmo: s.playbackRate || 1,
  }, Date.now());
}

/** Um publicador por sessão autenticada; não depende de ter o Social aberto. */
export function iniciarPresenca(userId: string): () => void {
  let terminado = false;
  let sequencia = 0;
  let fila = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastPublished=0;
  const sessao = Crypto.randomUUID();
  const dispositivo = getDeviceId();
  const publicar = (encerrar = false) => {
    lastPublished=Date.now();
    const s = usePlayer.getState();
    const faixa = s.current && s.isPlaying && s.playbackConfirmed && !s.buffering && !s.error ? s.current : null;
    const seq = ++sequencia;
    // `appEstaVisivel` e nao `Platform.OS === 'web'`: no PC isto dizia SEMPRE
    // que a pessoa estava activa, sem sequer olhar para a janela. Bastava ter
    // o Duotone aberto e minimizado -- ou o portatil fechado -- para aparecer
    // "Online now" aos amigos durante horas, mesmo com o telemovel desligado.
    // No PC conta tambem quem esta a usar o computador com a janela escondida,
    // a tocar ou nao (18/9, 1/10): ver `lib/presencaAtiva.ts`.
    const visivel = appEstaVisivel();
    fila = fila.catch(() => {}).then(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.id !== userId) return;
      const ativo = contaComoAtivo({
        visivel, computador: Platform.OS === 'web',
        // So se pergunta quando pode mudar a resposta: com a janela a vista,
        // ou no iPhone, a inatividade nao decide nada.
        inativoS: !visivel && Platform.OS === 'web' ? await segundosSemInteracao() : null,
      });
      // A escuta privada decide-se na hora do ENVIO e não na da chamada: um
      // envio que estava na fila quando a pessoa a ligou já sai sem a faixa.
      // E espera-se pela preferência -- no arranque, publicar primeiro e ler
      // depois deixava a faixa à vista dos amigos durante uns segundos.
      await garantirPrivacidade();
      const privada = usePrivacidade.getState().privada;
      const { error } = await supabase.rpc('publish_social_presence', {
        p_device_id: await dispositivo, p_session_id: sessao, p_sequence: seq,
        p_active: ativo && !encerrar, p_end: encerrar,
        // A posição e a velocidade viajam com a faixa (26/9): a barra de
        // progresso dos amigos no PC. Lidas na hora do ENVIO, que é a hora que
        // o servidor carimba. Sem a migração presenca-com-posicao.sql o
        // servidor deita-as fora e fica tudo como antes.
        // A duração vai SEMPRE que o motor a sabe (27/9): muitas faixas do
        // YouTube (pesquisa, Smart Shuffle) chegam sem `durationSeconds`, e
        // sem duração a barra dos amigos não sabe que fração encher -- a do
        // amigo do João ia com `durationSeconds: null` e não aparecia.
        p_track: encerrar || privada || !faixa ? null : {
          ...faixa,
          durationSeconds: faixa.durationSeconds
            ?? (usePlayer.getState().durationMs > 0 ? Math.round(usePlayer.getState().durationMs / 1000) : null),
          // Projetada para AGORA (1/10): crua, a posição é a do último aviso do
          // motor, até um segundo atrás -- e quem te segue ficava esse segundo
          // atrás de ti. Ver `posicaoProjetada`.
          positionMs: Math.round(posicaoAgoraParaAPresenca()),
          rate: usePlayer.getState().playbackRate || 1,
          // As próximas, para o Up next de quem te segue (27/9, "Listen along";
          // supabase/presenca-com-fila.sql). Num Jam, as da fila partilhada.
          aSeguir: proximasParaAPresenca(useOuvirJuntos.getState().sessao
            ? useOuvirJuntos.getState().fila.map((i) => i.track)
            : usePlayer.getState().upcomingQueue().map((e) => e.track)),
        },
      });
      if (error) console.warn('Não foi possível publicar a presença:', error.message);
    });
    return fila;
  };
  const changed = () => {
    if (terminado) return;
    clearTimeout(timer);
    const s = usePlayer.getState();
    if (!s.isPlaying || !s.current) void publicar();
    else timer = setTimeout(() => void publicar(), 1500);
  };
  const unsubscribe = usePlayer.subscribe((s, p) => {
    if (s.current !== p.current || s.isPlaying !== p.isPlaying || s.playbackConfirmed !== p.playbackConfirmed || s.buffering !== p.buffering || s.error !== p.error) changed();
    // A fila mudou (quem te segue vê as próximas): publica com o mesmo atraso.
    else if (!terminado && s.isPlaying && (s.queue !== p.queue || s.shuffleOrder !== p.shuffleOrder)) changed();
    // O avanço vem do timeUpdate nativo, que também serve o sleep timer com
    // o ecrã bloqueado. Não depender só de setInterval para o batimento iOS.
    // Uma ida na barra ou outra velocidade publicam já: sem isso o progresso
    // dos amigos mostrava um sítio que já não existia até ao batimento seguinte.
    else if(!terminado&&s.isPlaying&&(s.playbackRate!==p.playbackRate||Math.abs((s.positionMs-p.positionMs)-(s.positionAt-p.positionAt)*(s.playbackRate||1))>4000))changed();
    else if(!terminado&&s.positionMs!==p.positionMs&&s.isPlaying&&Date.now()-lastPublished>=PRESENCE_PUBLISH_MS)void publicar();
  });
  // Ligar a privada tem de tirar a faixa JÁ, e não no próximo batimento: são
  // até 75 segundos a mostrar precisamente aquilo que se quis esconder.
  const pararPrivacidade = usePrivacidade.subscribe((s, p) => {
    if (!terminado && s.privada !== p.privada) void publicar();
  });
  const app = AppState.addEventListener('change', () => { if (!terminado) void publicar(); });
  const beat = setInterval(() => {
    // Continua a bater com musica a tocar: e o que mantem o "esta a ouvir"
    // verdadeiro. O que isso ja NAO faz e dizer que a pessoa esta online --
    // essa janela agora so se estende com `p_active`.
    if (!terminado && (appEstaVisivel() || usePlayer.getState().isPlaying)) void publicar();
  }, PRESENCE_PUBLISH_MS);
  // O batimento de cima nao corre no PC escondido e parado, e era ai que a
  // pessoa desaparecia: minimizada, sem musica, sentada ao computador (1/10).
  // Pergunta-se ao sistema (local, sem rede) e so se publica com ela la --
  // ausente, deixa-se o online caducar sozinho em vez de bater a noite toda.
  const vigiaDoPc = Platform.OS === 'web' ? setInterval(() => {
    if (terminado || appEstaVisivel() || usePlayer.getState().isPlaying) return;
    void segundosSemInteracao().then((s) => { if (!terminado && estaAoComputador(s)) void publicar(); });
  }, BATIMENTO_ESCONDIDO_NO_PC_MS) : undefined;
  const voltar = () => { if (!terminado) void publicar(); };
  const terminar = async () => {
    if (terminado) return;
    terminado = true;
    clearTimeout(timer); clearInterval(beat); clearInterval(vigiaDoPc); unsubscribe(); pararPrivacidade(); app.remove();
    if (Platform.OS === 'web') { window.removeEventListener('online', voltar); window.removeEventListener('focus', voltar); window.removeEventListener('pagehide', sair); }
    await publicar(true);
  };
  const sair = () => { void terminar(); };
  if (Platform.OS === 'web') { window.addEventListener('online', voltar); window.addEventListener('focus', voltar); window.addEventListener('pagehide', sair); }
  terminarAtual = terminar;
  void publicar();
  return () => { void terminar(); if (terminarAtual === terminar) terminarAtual = null; };
}
