import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { endSession } from '../lib/sessionSync';
import { terminarPresenca } from '../lib/presenceSync';

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
  initialized: boolean;
  init: () => void;
  /** `identifier` pode ser email OU username (ver email_for_username no SQL). */
  signIn: (identifier: string, password: string) => Promise<string | null>;
  signUp: (
    email: string,
    password: string,
    username: string
  ) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Atualiza o nome/username (metadata da conta + tabela profiles). */
  updateName: (name: string) => Promise<string | null>;
  /** Envia email de redefinição de palavra-passe para o email da conta. */
  resetPassword: () => Promise<string | null>;
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  initialized: false,

  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, initialized: true });
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
    });
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
          return `Demasiadas tentativas falhadas. Tente novamente em ${secondsLeft} segundos.`;
        }
      }
    } catch {
      // ignorar erros de AsyncStorage
    }

    let email = identifier.trim();
    // Sem "@" → tratamos como username: pedimos o email associado via RPC.
    // (Se o SQL de username ainda não foi aplicado, a RPC falha e explicamos.)
    if (!email.includes('@')) {
      const { data, error } = await supabase.rpc('email_for_username', {
        uname: email,
      });
      if (error) {
        return 'Username login is not set up on the server yet. Use your email, or run supabase/username-login.sql.';
      }
      if (!data) {
        await handleFailedLoginAttempt();
        return 'Credenciais inválidas. Por favor, verifique os seus dados.';
      }
      email = data as string;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      await handleFailedLoginAttempt();
      // Oculta a mensagem de erro específica do Supabase por questões de segurança
      return 'Credenciais inválidas. Por favor, verifique os seus dados.';
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
    return error ? error.message : null;
  },

  signOut: async () => {
    // Antes do signOut, enquanto ainda há JWT para a RLS deixar apagar: uma
    // sessão órfã ficava a oferecer handoff no outro dispositivo até expirar.
    await endSession();
    await terminarPresenca();
    await supabase.auth.signOut();
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

  resetPassword: async () => {
    const { data } = await supabase.auth.getUser();
    const mail = data.user?.email;
    if (!mail) return 'No email on this account.';
    const { error } = await supabase.auth.resetPasswordForEmail(mail);
    return error ? error.message : null;
  },
}));
