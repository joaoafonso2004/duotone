import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  initialized: boolean;
  init: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Atualiza o nome/username (metadata da conta + tabela profiles). */
  updateName: (name: string) => Promise<string | null>;
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

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return error ? error.message : null;
  },

  signUp: async (email, password, name) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    });
    return error ? error.message : null;
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },

  updateName: async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return 'Name cannot be empty.';
    const { data, error } = await supabase.auth.updateUser({ data: { name: trimmed } });
    if (error) return error.message;
    // Refletir já na sessão local (a UI lê de session.user.user_metadata.name).
    if (data.user) {
      const { data: sess } = await supabase.auth.getSession();
      set({ session: sess.session });
    }
    // Manter a tabela profiles em sincronia (best-effort; não bloqueia).
    const uid = data.user?.id;
    if (uid) {
      supabase.from('profiles').update({ name: trimmed }).eq('id', uid).then(() => {});
    }
    return null;
  },
}));
