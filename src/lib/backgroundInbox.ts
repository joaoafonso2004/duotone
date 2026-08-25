import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { getFriendships, getInboxItems } from '../api/social';
import { notifyNewInboxItems, notifyPendingFriendRequests } from './localNotifications';

/**
 * Rede de segurança para quando a app está COMPLETAMENTE fechada.
 *
 * Expectativa realista: o iOS não garante hora nenhuma. O BGTaskScheduler
 * decide quando corre, com base nos hábitos de uso do dono do telemóvel, e
 * pode ir de uns minutos a várias horas — raramente com o aparelho bloqueado
 * há muito tempo. Serve para "tens mensagens novas" com atraso, não para
 * conversar em tempo real.
 *
 * O caminho rápido é outro e vive no RootNavigator: enquanto a Duotone estiver
 * a tocar música, o processo está vivo e o polling de 15s nota as mensagens
 * quase de imediato. Nesta app isso cobre grande parte do uso real.
 */

const TASK = 'duotone-inbox-check';

TaskManager.defineTask(TASK, async () => {
  try {
    const items = await getInboxItems();
    if (items.length > 0) await notifyNewInboxItems(items);

    const friendships = await getFriendships();
    const pendentes = friendships.filter((f) => f.status === 'pending' && !f.isSender).length;
    await notifyPendingFriendRequests(pendentes);

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    // Sem sessão, sem rede, ou o Supabase em baixo — não é falha nossa e não
    // vale a pena marcar como erro (o iOS penaliza tarefas que falham).
    return BackgroundTask.BackgroundTaskResult.Success;
  }
});

/** Regista a tarefa. Idempotente — chamar em cada arranque é seguro. */
export async function registerBackgroundInboxCheck(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (await TaskManager.isTaskRegisteredAsync(TASK)) return;
    await BackgroundTask.registerTaskAsync(TASK, {
      // Pedido, não promessa: o iOS trata isto como um mínimo desejado.
      minimumInterval: 15,
    });
  } catch {
    // Em simulador ou com background refresh desligado nas Definições do
    // iPhone isto rejeita — a app funciona na mesma, só sem esta rede.
  }
}
