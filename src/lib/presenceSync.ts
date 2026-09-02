import { AppState, Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { getDeviceId } from './deviceIdentity';
import { usePlayer } from '../state/player';

let terminarAtual: (() => Promise<void>) | null = null;
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
    const ativo = Platform.OS === 'web' || AppState.currentState === 'active';
    fila = fila.catch(() => {}).then(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.id !== userId) return;
      const { error } = await supabase.rpc('publish_social_presence', {
        p_device_id: await dispositivo, p_session_id: sessao, p_sequence: seq,
        p_active: ativo && !encerrar, p_track: encerrar ? null : faixa, p_end: encerrar,
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
    else if(!terminado&&s.positionMs!==p.positionMs&&s.isPlaying&&Date.now()-lastPublished>=45000)void publicar();
  });
  const app = AppState.addEventListener('change', () => { if (!terminado) void publicar(); });
  const beat = setInterval(() => {
    if (!terminado && (Platform.OS === 'web' || AppState.currentState === 'active' || usePlayer.getState().isPlaying)) void publicar();
  }, 45000);
  const voltar = () => { if (!terminado) void publicar(); };
  const terminar = async () => {
    if (terminado) return;
    terminado = true;
    clearTimeout(timer); clearInterval(beat); unsubscribe(); app.remove();
    if (Platform.OS === 'web') { window.removeEventListener('online', voltar); window.removeEventListener('focus', voltar); window.removeEventListener('pagehide', sair); }
    await publicar(true);
  };
  const sair = () => { void terminar(); };
  if (Platform.OS === 'web') { window.addEventListener('online', voltar); window.addEventListener('focus', voltar); window.addEventListener('pagehide', sair); }
  terminarAtual = terminar;
  void publicar();
  return () => { void terminar(); if (terminarAtual === terminar) terminarAtual = null; };
}
