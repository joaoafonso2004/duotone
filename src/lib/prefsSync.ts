import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { supabase } from './supabase';
import { chavesAEscrever, DE_FORA, PREFIXO } from './prefsFusao';

/**
 * As preferências na conta, e não no aparelho.
 *
 * O problema que isto resolve foi medido na prática: com o certificado gratuito
 * a expirar de sete em sete dias, reinstalar a app é rotina — e a cada
 * reinstalação perdiam-se o tema, a qualidade de áudio, o modo do glitch, o
 * equalizador base, o repeat e o shuffle.
 *
 * **A regra de fusão é deliberadamente tímida:** ao entrar, só se escreve
 * localmente uma chave que o aparelho NÃO tenha. Nunca se sobrepõe uma escolha
 * feita aqui por uma que veio de lá. Isso resolve o caso que interessa — o
 * aparelho acabou de ser limpo e não tem nada — sem arriscar apagar uma
 * definição que a pessoa mudou há dois minutos noutro sítio.
 *
 * **Quando se envia:** ao passar para segundo plano, e ao sair. Sem
 * temporizadores: mudar uma definição e fechar a app é o caminho real, e um
 * relógio a correr para isto era exactamente o tipo de trabalho contínuo que se
 * anda a tirar da app.
 */

let utilizador: string | null = null;
let ultimoEnviado = '';
let desligarAppState: (() => void) | null = null;

async function lerLocais(): Promise<Record<string, string>> {
  try {
    const chaves = (await AsyncStorage.getAllKeys())
      .filter((k) => k.startsWith(PREFIXO) && !DE_FORA.has(k));
    if (!chaves.length) return {};
    const pares = await AsyncStorage.multiGet(chaves);
    const saco: Record<string, string> = {};
    for (const [chave, valor] of pares) if (valor != null) saco[chave] = valor;
    return saco;
  } catch {
    return {};
  }
}

async function enviar(): Promise<void> {
  if (!utilizador) return;
  const saco = await lerLocais();
  const retrato = JSON.stringify(saco);
  // Nada mudou desde a última vez: não se gasta rede a repetir.
  if (retrato === ultimoEnviado || retrato === '{}') return;
  try {
    const { error } = await supabase.from('user_prefs')
      .upsert({ user_id: utilizador, prefs: saco, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' });
    if (!error) ultimoEnviado = retrato;
  } catch {
    // Sem rede: fica para a próxima vez que a app for para segundo plano.
  }
}

/**
 * Traz o que faltar, e passa a enviar o que mudar.
 *
 * Devolve o `parar`, para a app o chamar quando a sessão termina.
 */
export function sincronizarPreferencias(userId: string): () => void {
  utilizador = userId;
  ultimoEnviado = '';

  void (async () => {
    try {
      const { data, error } = await supabase.from('user_prefs')
        .select('prefs').eq('user_id', userId).maybeSingle();
      if (error || !data?.prefs) return;

      const locais = await lerLocais();
      const aEscrever = chavesAEscrever(locais, data.prefs as Record<string, unknown>);
      if (aEscrever.length) await AsyncStorage.multiSet(aEscrever);
      ultimoEnviado = JSON.stringify(await lerLocais());
    } catch {
      // Sem a migração aplicada, ou sem rede: a app fica como estava.
    }
  })();

  const aoMudarDeEstado = (estado: string) => {
    if (estado !== 'active') void enviar();
  };
  const sub = AppState.addEventListener('change', aoMudarDeEstado);
  desligarAppState = () => sub.remove();

  return () => {
    void enviar();
    desligarAppState?.();
    desligarAppState = null;
    utilizador = null;
    ultimoEnviado = '';
  };
}
