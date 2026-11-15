/**
 * iPhone: o que não passa pelo JSX -- os `Alert.alert` (15/11). Os ecrãs
 * traduzem-se no runtime JSX (`jsx-runtime.ts`). No PC: `instalar.web.ts`.
 *
 * Instala-se sempre (a língua só se sabe depois de ler o AsyncStorage) e o
 * `traduzir` decide em cada chamada: em inglês devolve o mesmo texto.
 */
import { Alert } from 'react-native';
import { traduzir } from './index';

let instalado = false;

export function instalarTraducao(): void {
  if (instalado) return;
  instalado = true;
  const original = Alert.alert.bind(Alert);
  const t = (v: unknown) => (typeof v === 'string' ? traduzir(v) : v);
  Alert.alert = ((titulo: string, mensagem?: string, botoes?: any[], opcoes?: any) => original(
    t(titulo) as string,
    t(mensagem) as string | undefined,
    Array.isArray(botoes) ? botoes.map((b) => (b && typeof b.text === 'string' ? { ...b, text: traduzir(b.text) } : b)) : botoes,
    opcoes,
  )) as typeof Alert.alert;
}
