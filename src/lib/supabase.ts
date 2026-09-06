import { Platform } from 'react-native';
if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto');
}
import { authStorage } from './authStorage';
import { createClient } from '@supabase/supabase-js';
import { ENV } from './env';

export const supabase = createClient(
  ENV.SUPABASE_URL || 'https://placeholder.supabase.co',
  ENV.SUPABASE_ANON_KEY || 'placeholder',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
