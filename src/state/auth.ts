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
}));
