import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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
      if (!data) return 'No account found for that username.';
      email = data as string;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
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
