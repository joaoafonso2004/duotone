import { AppState, Platform } from 'react-native';
import { useConnectivity } from './connectivity';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { endSession } from '../lib/sessionSync';
import { terminarPresenca } from '../lib/presenceSync';
import { esquecerPerfisPublicos } from '../api/profiles';
import { mensagemDoRegisto } from '../lib/mensagemDoRegisto';
import { erroDoCodigo, erroDoEmail, limparCodigo, mensagemDaRecuperacao, normalizarEmail } from '../lib/recuperacaoDaPassword';

let authGeneration=0;
/**
 * O que tem de parar antes de a sessão ir -- o leitor (27/9). Registado pelo
 * App.tsx, e não importado daqui: esta loja fica sem o leitor atrás, como a
 * `test-personalization-offline.mjs` a carrega.
 */
let antesDeSair: () => Promise<void> = async () => {};
export function registarAntesDeSair(fn: () => Promise<void>): void { antesDeSair = fn; }
let unsubscribeAuth:(()=>void)|undefined;
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 60 * 1000; // 60 segundos de bloqueio

async function handleFailedLoginAttempt(): Promise<void> {
  try {
    const attemptsStr = await AsyncStorage.getItem('auth:loginAttempts') || '0';
    const attempts = parseInt(attemptsStr, 10) + 1;
    await AsyncStorage.setItem('auth:loginAttempts', String(attempts));
    
    if (attempts >= MAX_ATTEMPTS) {
      const lockoutTime = Date.now() + LOCKOUT_TIME_MS;
      await AsyncStorage.setItem('auth:lockoutUntil', String(lockoutTime));
    }
  } catch {}
}

interface AuthState {
  session: Session | null;
  offlineUserId: string | null;
  initialized: boolean;
  init: () => void;
  refreshSession:()=>Promise<void>;
  /**
   * `identifier` pode ser email OU username. O username resolve-se no servidor
   * pela `email_para_login`, que só devolve o email a quem já provou saber a
   * password -- ver supabase/username-login-seguro.sql.
   */
  signIn: (identifier: string, password: string) => Promise<string | null>;
  signUp: (
    email: string,
    password: string,
    username: string
  ) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Atualiza o nome/username (metadata da conta + tabela profiles). */
  updateName: (name: string) => Promise<string | null>;
  /**
   * A recuperação por código (22/11, `lib/recuperacaoDaPassword.ts`): manda o código
   * para o email; depois confirma-o e muda a palavra-passe, e só então entra.
   * Devolvem a frase de erro, ou null.
   */
  pedirCodigoDeRecuperacao: (email: string) => Promise<string | null>;
  mudarPasswordComCodigo: (email: string, codigo: string, nova: string) => Promise<string | null>;
  /** Larga uma recuperação a meio (o "Back"): a sessão do código não fica no ar. */
  cancelarRecuperacao: () => Promise<void>;
}

/**
 * Enquanto se muda a palavra-passe com o código, a sessão que o código abre fica
 * RETIDA: a loja punha-a logo no sítio (o `onAuthStateChange`), a app abria e o
 * ecrã fechava antes de a palavra-passe mudar (e um erro dela perdia-se).
 */
let aRecuperar = false;
let sessaoRetida: Session | null = null;

export const useAuth = create<AuthState>((set) => ({
  session: null,
  offlineUserId: null,
  initialized: false,

  init: () => {
    const run=++authGeneration;
    unsubscribeAuth?.();
    // Guarda apenas a identidade para abrir ficheiros locais. Nunca fabrica
    // tokens: todo o acesso remoto continua a exigir uma sessão Supabase.
    if(Platform.OS==='ios')void AsyncStorage.getItem('offline:last-user').then(id=>{
      if(run===authGeneration&&id&&!useAuth.getState().session)set({offlineUserId:id,initialized:true});
    }).catch(()=>{});
    supabase.auth.getSession().then(({data,error})=>{
      if(run!==authGeneration)return;
      if(data.session)set({session:data.session,offlineUserId:data.session.user.id,initialized:true});
      else if(!error&&!useConnectivity.getState().offline){authGeneration++;set({session:null,offlineUserId:null,initialized:true});if(Platform.OS==='ios')void AsyncStorage.removeItem('offline:last-user');}
      else set({initialized:true});
    }).catch(()=>{if(run===authGeneration)set({initialized:true});});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(session&&aRecuperar){sessaoRetida=session;return;}
      if(session){
        authGeneration++;
        set({session,offlineUserId:session.user.id,initialized:true});
        if(Platform.OS==='ios')void AsyncStorage.setItem('offline:last-user',session.user.id);
      }else if(event==='SIGNED_OUT'){
        authGeneration++;
        set({session:null,offlineUserId:null,initialized:true});
        if(Platform.OS==='ios')void AsyncStorage.removeItem('offline:last-user');
      }
    });
    // Sem sessão por falta de rede, com a conta deste aparelho à espera (26/11, a
    // 7.2.0 "não tá a dar" no iPhone, como a 7.1.0 no primeiro arranque): a
    // renovação do arranque falhou (o primeiro pedido de uma app acabada de
    // instalar, nos dados móveis, costuma falhar) e a app ficava em "Offline" até
    // o relógio do supabase-js tentar outra vez. Volta a pedir a sessão quando a
    // rede volta, quando a app volta à frente, e aos 2, 6 e 15 s. Só nesse estado:
    // com sessão, ou sem conta guardada, não pede nada. Só LÊ a sessão (o
    // supabase-js renova-a e avisa pelo onAuthStateChange): nunca sai da conta
    // daqui, que sem rede a conta do aparelho é o que abre os downloads.
    const semSessao=()=>Platform.OS==='ios'&&!useAuth.getState().session&&!!useAuth.getState().offlineUserId;
    const tentar=()=>{
      if(!semSessao())return;
      void supabase.auth.getSession().then(({data})=>{
        if(data.session&&semSessao())set({session:data.session,offlineUserId:data.session.user.id,initialized:true});
      }).catch(()=>{});
    };
    const tentativas=[2000,6000,15000].map(ms=>setTimeout(tentar,ms));
    const rede=useConnectivity.subscribe((s,antes)=>{if(antes.offline&&!s.offline)tentar();});
    const frente=AppState.addEventListener('change',estado=>{if(estado==='active')tentar();});
    unsubscribeAuth=()=>{subscription.unsubscribe();for(const t of tentativas)clearTimeout(t);rede();frente.remove();};
  },

  refreshSession:async()=>{
    if(aRecuperar)return;
    const run=authGeneration;
    const {data,error}=await supabase.auth.getSession();
    if(run!==authGeneration)return;
    if(data.session){
      set({session:data.session,offlineUserId:data.session.user.id,initialized:true});
      if(Platform.OS==='ios')void AsyncStorage.setItem('offline:last-user',data.session.user.id);
    }else if(!error){
      authGeneration++;
      set({session:null,offlineUserId:null,initialized:true});
      if(Platform.OS==='ios')void AsyncStorage.removeItem('offline:last-user');
    }
  },

  signIn: async (identifier, password) => {
    // 1) Rate Limiting - Verificar se está sob bloqueio temporário
    try {
      const now = Date.now();
      const lockoutStr = await AsyncStorage.getItem('auth:lockoutUntil');
      if (lockoutStr) {
        const lockoutTime = parseInt(lockoutStr, 10);
        if (now < lockoutTime) {
          const secondsLeft = Math.ceil((lockoutTime - now) / 1000);
          return `Too many failed attempts. Try again in ${secondsLeft} seconds.`;
        }
      }
    } catch {
      // ignorar erros de AsyncStorage
    }

    let email = identifier.trim();
    // Sem "@" é username. Daqui não se distingue "username não existe" de
    // "password errada" -- as duas devolvem nada. É essa indistinção que
    // impede usar o login para recolher os emails de quem tem perfil.
    if (!email.includes('@')) {
      const { data, error } = await supabase.rpc('email_para_login', { uname: email, pass: password });
      if (error || !data) {
        await handleFailedLoginAttempt();
        return 'Invalid credentials. Please check your details.';
      }
      email = data as string;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      await handleFailedLoginAttempt();
      // Oculta a mensagem de erro específica do Supabase por questões de segurança
      return 'Invalid credentials. Please check your details.';
    }

    // Sucesso - Limpar tentativas falhadas
    try {
      await AsyncStorage.removeItem('auth:loginAttempts');
      await AsyncStorage.removeItem('auth:lockoutUntil');
    } catch {}

    return null;
  },

  signUp: async (email, password, username) => {
    const uname = username.trim();
    // Pré-verificação amigável de disponibilidade (a unicidade real é
    // garantida pelo índice único em profiles.username — ver SQL). Se a RPC
    // não existir ainda, saltamos a verificação sem bloquear o registo.
    if (uname) {
      const { data, error } = await supabase.rpc('username_available', {
        uname,
      });
      if (!error && data === false) return 'That username is already taken.';
    }
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: uname || email.split('@')[0], username: uname } },
    });
    // O registo fechado no painel chega como "Signups not allowed for this
    // instance": troca-se por uma frase que quem chega percebe.
    return mensagemDoRegisto(error);
  },

  signOut: async () => {
    authGeneration++;
    // O leitor é da conta que sai: parado e sem fila antes de a sessão ir, senão
    // quem entra a seguir encontrava a música e a fila de outra pessoa (27/9).
    // Aqui, e não em cada botão: "apagar conta" saía sem o fechar, no iPhone e
    // no PC, e o PC chegou a ficar sem porta nenhuma para sair.
    await antesDeSair().catch(() => {});
    // Antes do signOut, enquanto ainda há JWT para a RLS deixar apagar: uma
    // sessão órfã ficava a oferecer handoff no outro dispositivo até expirar.
    if(!useConnectivity.getState().offline){await endSession();await terminarPresenca();}
    if(Platform.OS==='ios')await AsyncStorage.removeItem('offline:last-user');
    set({session:null,offlineUserId:null});
    // Os perfis lidos (30 min) eram os amigos de quem saiu.
    esquecerPerfisPublicos();
    await supabase.auth.signOut({scope:useConnectivity.getState().offline?'local':'global'});
  },

  updateName: async (name) => {
    const uname = name.trim();
    if (!uname) return 'Username cannot be empty.';

    // Se o username mudou, confirmar que está livre (a unicidade real é
    // garantida pelo índice único em profiles.username — ver SQL).
    const { data: userData } = await supabase.auth.getUser();
    const current = (userData.user?.user_metadata?.username as string | undefined) ?? '';
    if (uname.toLowerCase() !== current.toLowerCase()) {
      const { data: avail, error: e1 } = await supabase.rpc('username_available', {
        uname,
      });
      if (!e1 && avail === false) return 'That username is already taken.';
    }

    // O username é também o nome mostrado — mantemos os dois em sincronia.
    const { data, error } = await supabase.auth.updateUser({
      data: { name: uname, username: uname },
    });
    if (error) return error.message;

    // Refletir já na sessão local (a UI lê de session.user.user_metadata).
    const { data: sess } = await supabase.auth.getSession();
    set({ session: sess.session });

    // Manter a tabela profiles em sincronia (best-effort; não bloqueia).
    const uid = data.user?.id;
    if (uid) {
      supabase
        .from('profiles')
        .update({ name: uname, username: uname })
        .eq('id', uid)
        .then(() => {});
    }
    return null;
  },

  pedirCodigoDeRecuperacao: async (texto) => {
    const invalido = erroDoEmail(texto);
    if (invalido) return invalido;
    const email = normalizarEmail(texto);
    // Sem `redirectTo`: o email traz o código ({{ .Token }}), não um link. O Supabase
    // responde igual a um email que não existe (não diz quem tem conta).
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return mensagemDaRecuperacao(error);
  },

  mudarPasswordComCodigo: async (texto, codigo, nova) => {
    const email = normalizarEmail(texto);
    // Uma tentativa anterior já confirmou o código (falhou a palavra-passe): não se pede outro.
    if (!sessaoRetida) {
      const invalido = erroDoCodigo(codigo);
      if (invalido) return invalido;
      aRecuperar = true;
      const { error } = await supabase.auth.verifyOtp({ email, token: limparCodigo(codigo), type: 'recovery' });
      if (error) {
        aRecuperar = false;
        return mensagemDaRecuperacao(error);
      }
    }
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) return mensagemDaRecuperacao(error);
    aRecuperar = false;
    const sessao = sessaoRetida ?? (await supabase.auth.getSession()).data.session;
    sessaoRetida = null;
    if (sessao) {
      authGeneration++;
      set({ session: sessao, offlineUserId: sessao.user.id, initialized: true });
      if (Platform.OS === 'ios') void AsyncStorage.setItem('offline:last-user', sessao.user.id);
    }
    return null;
  },

  cancelarRecuperacao: async () => {
    const retida = sessaoRetida;
    const estava = !!useAuth.getState().session;
    aRecuperar = false;
    sessaoRetida = null;
    if (!retida) return;
    // Nas Definições a pessoa já tinha sessão: fica com a nova. No início de sessão,
    // a do código sai (só servia para mudar a palavra-passe).
    if (estava) set({ session: retida, offlineUserId: retida.user.id });
    else await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  },
}));
