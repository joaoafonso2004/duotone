import { Platform } from 'react-native';
if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto');
}
import { authStorage } from './authStorage';
import { createClient } from '@supabase/supabase-js';
import { ENV } from './env';
import { criarFetchDoSupabase, definirAparelhoDosPedidos, definirVersaoDosPedidos } from './fetchDoSupabase';
import { definirEstadoDoRealtime, registarQuedaDoRealtime } from './pedidosAoSupabase';
import { getDeviceId } from './deviceIdentity';
import { APP_VERSION } from './buildInfo';

// O aparelho e a versão vão nos pedidos à API (11/11): as marcas de
// `o_que_mudou` sabem quem escreveu, e um dia o Supabase pode deixar de servir
// as versões que não dizem qual são. No PC só pela ponte (ver `fetchDoSupabase`).
definirVersaoDosPedidos(APP_VERSION, Platform.OS === 'web');
void getDeviceId().then((id) => definirAparelhoDosPedidos(id, Platform.OS === 'web')).catch(() => {});

// Conta cada pedido e, no PC, manda-o pelo processo principal (sem o OPTIONS
// do CORS). Ver `lib/fetchDoSupabase.ts`.
const ponte = typeof window !== 'undefined' ? window.duotoneDesktop?.pedirAoSupabase : undefined;

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
    global: { fetch: criarFetchDoSupabase(ponte) },
    realtime: {
      // O batimento do Realtime num Web Worker no PC (23/10). Com a janela no
      // tabuleiro e sem música, o Chromium estrangula os temporizadores da
      // página; o batimento atrasava, o servidor fechava o socket, e cada
      // parte da app caía para a leitura periódica (o relatório de um PC: 62
      // releituras da inbox por hora, o Connect de 20 em 20 s). Os workers
      // não são estrangulados. O script vai em linha (um Blob), sem pedir
      // nada lá fora. O iPhone não tem Web Workers: fica como estava.
      worker: typeof window !== 'undefined' && Platform.OS === 'web' && typeof (globalThis as any).Worker === 'function',
      heartbeatCallback: (estado: string) => {
        if (estado === 'timeout' || estado === 'disconnected' || estado === 'error') registarQuedaDoRealtime();
      },
    },
  }
);

definirEstadoDoRealtime(() => {
  const canais = supabase.getChannels();
  const ligados = canais.filter((c) => c.state === 'joined').length;
  return `${supabase.realtime.isConnected() ? 'connected' : 'NOT connected'}, ${ligados}/${canais.length} channels joined`;
});
