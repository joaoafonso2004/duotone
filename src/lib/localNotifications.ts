import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { SharedItem } from '../api/social';

/**
 * Notificações LOCAIS — disparadas pelo próprio telemóvel, não por um servidor.
 *
 * Porque não push a sério: notificações push (APNs) exigem o entitlement
 * `aps-environment`, que a Apple só concede a contas de programador PAGAS. Esta
 * app é assinada com uma conta gratuita, por isso um push nunca lhe chegaria —
 * é limitação da plataforma, não do código.
 *
 * O que isto consegue mesmo assim, e é mais do que parece: a Duotone toca
 * música em segundo plano, e enquanto toca o processo está VIVO. O polling que
 * já existia no RootNavigator continua a correr, portanto uma mensagem que
 * chegue com música a tocar vira notificação em segundos. Com a app
 * completamente fechada dependemos do agendador do iOS (ver backgroundInbox.ts),
 * que corre quando lhe apetece — aí a notificação chega atrasada.
 */

/** Mostrar a notificação mesmo com a app aberta fica a cargo de quem chama;
 * aqui só decidimos como o sistema a apresenta quando chega. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const PERMISSION_ASKED_KEY = 'notifications:permissionAsked';
/** Último item por que JÁ notificámos — separado de `lastSeenId` (que marca o
 * que o utilizador já viu). Sem isto, cada volta do polling repetia a mesma
 * notificação de 15 em 15 segundos. */
const LAST_NOTIFIED_KEY = 'notifications:lastNotifiedId';
const LAST_FRIEND_COUNT_KEY = 'notifications:lastPendingFriendCount';

/** Pede permissão uma vez. Devolve true se podemos notificar. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    // Só pedimos uma vez: insistir a cada arranque é irritante e o iOS
    // deixa de mostrar o diálogo depois da primeira recusa.
    if (!current.canAskAgain) return false;
    if (await AsyncStorage.getItem(PERMISSION_ASKED_KEY)) return false;
    await AsyncStorage.setItem(PERMISSION_ASKED_KEY, '1');
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

async function present(title: string, body: string, target: 'social' | 'profile'): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { target } },
      trigger: null, // já
    });
  } catch {
    // sem permissão ou sem suporte — não vale a pena rebentar por isto
  }
}

function describe(item: SharedItem): string {
  const quem = item.sender.name || item.sender.username;
  if (item.message) return `${quem}: ${item.message}`;
  if (item.itemType === 'playlist') return `${quem} partilhou uma playlist contigo`;
  const faixa = item.trackData?.title;
  return faixa ? `${quem} partilhou ${faixa}` : `${quem} partilhou uma música contigo`;
}

/**
 * Notifica sobre itens novos da inbox. Só notifica o que ainda não foi
 * notificado, e só o item mais recente — receber cinco mensagens de uma vez não
 * deve encher o ecrã de bloqueio com cinco banners.
 */
export async function notifyNewInboxItems(items: SharedItem[]): Promise<void> {
  if (Platform.OS === 'web' || items.length === 0) return;
  try {
    const latest = items[0]; // getInboxItems devolve por created_at desc
    const lastNotified = await AsyncStorage.getItem(LAST_NOTIFIED_KEY);
    if (lastNotified === latest.id) return;
    await AsyncStorage.setItem(LAST_NOTIFIED_KEY, latest.id);
    // Primeira execução (ainda sem marca): não notificar o histórico todo.
    if (lastNotified === null) return;
    const extra = items.length > 1 ? ` (+${items.length - 1} na inbox)` : '';
    await present('Duotone', describe(latest) + extra, 'social');
  } catch {
    // ignorar
  }
}

/** Notifica quando o número de pedidos de amizade pendentes AUMENTA. */
export async function notifyPendingFriendRequests(pendingCount: number): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const raw = await AsyncStorage.getItem(LAST_FRIEND_COUNT_KEY);
    await AsyncStorage.setItem(LAST_FRIEND_COUNT_KEY, String(pendingCount));
    if (raw === null) return; // primeira execução — só guardar a base
    const anterior = Number(raw) || 0;
    if (pendingCount <= anterior) return;
    const novos = pendingCount - anterior;
    await present(
      'Duotone',
      novos === 1 ? 'Tens um novo pedido de amizade' : `Tens ${novos} novos pedidos de amizade`,
      'social'
    );
  } catch {
    // ignorar
  }
}
