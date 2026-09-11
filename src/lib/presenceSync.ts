import { AppState, Platform } from 'react-native';
import { appEstaVisivel } from './appVisibility';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { getDeviceId } from './deviceIdentity';
import { usePlayer } from '../state/player';
import { garantirPrivacidade, usePrivacidade } from '../state/privacidade';

let terminarAtual: (() => Promise<void>) | null = null;
// O servidor mantém cada publicação válida por 120 s. Setenta e cinco deixa
// margem confortável para rede lenta e quase reduz a metade os batimentos que
// antes saíam de 45 em 45 segundos.
const PRESENCE_PUBLISH_MS=75_000;
export async function terminarPresenca(): Promise<void> { await terminarAtual?.(); }

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
    const ativo = appEstaVisivel();
    fila = fila.catch(() => {}).then(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.id !== userId) return;
      // A escuta privada decide-se na hora do ENVIO e não na da chamada: um
      // envio que estava na fila quando a pessoa a ligou já sai sem a faixa.
      // E espera-se pela preferência -- no arranque, publicar primeiro e ler
      // depois deixava a faixa à vista dos amigos durante uns segundos.
      await garantirPrivacidade();
      const privada = usePrivacidade.getState().privada;
      const { error } = await supabase.rpc('publish_social_presence', {
        p_device_id: await dispositivo, p_session_id: sessao, p_sequence: seq,
        p_active: ativo && !encerrar, p_track: encerrar || privada ? null : faixa, p_end: encerrar,
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
    // O avanço vem do timeUpdate nativo, que também serve o sleep timer com
    // o ecrã bloqueado. Não depender só de setInterval para o batimento iOS.
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
  const voltar = () => { if (!terminado) void publicar(); };
  const terminar = async () => {
    if (terminado) return;
    terminado = true;
    clearTimeout(timer); clearInterval(beat); unsubscribe(); pararPrivacidade(); app.remove();
    if (Platform.OS === 'web') { window.removeEventListener('online', voltar); window.removeEventListener('focus', voltar); window.removeEventListener('pagehide', sair); }
    await publicar(true);
  };
  const sair = () => { void terminar(); };
  if (Platform.OS === 'web') { window.addEventListener('online', voltar); window.addEventListener('focus', voltar); window.addEventListener('pagehide', sair); }
  terminarAtual = terminar;
  void publicar();
  return () => { void terminar(); if (terminarAtual === terminar) terminarAtual = null; };
}
