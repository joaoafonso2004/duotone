import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { DeviceKind } from './handoff';

const KEY_DEVICE_ID = 'device:id';
const KEY_DEVICE_NAME = 'device:name';

/**
 * Identidade estável deste dispositivo, para o handoff saber distinguir "o
 * outro" de "eu próprio". Sem isto o PC oferecia-se para continuar aquilo
 * que ele próprio está a tocar.
 *
 * Vive no AsyncStorage (que no desktop é o localStorage): sobrevive a
 * reinícios, morre com a desinstalação — que é o comportamento certo, um
 * dispositivo reinstalado é um dispositivo novo.
 */

function randomDeviceId(): string {
  // Não precisa de ser criptográfico: só tem de ser único entre os
  // dispositivos de uma pessoa. Evita puxar dependências só para isto.
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}${rand()}`;
}

export function deviceKind(): DeviceKind {
  if (Platform.OS === 'web') return 'desktop';
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'unknown';
}

export function defaultDeviceName(): string {
  return Platform.OS === 'web' ? 'PC' : Platform.OS === 'ios' ? 'iPhone' : 'Telemóvel';
}

// Uma só resolução por arranque, partilhada por todos os chamadores.
let idPromise: Promise<string> | null = null;
let cachedId: string | null = null;

export function getDeviceId(): Promise<string> {
  if (!idPromise) {
    idPromise = (async () => {
      try {
        const stored = await AsyncStorage.getItem(KEY_DEVICE_ID);
        if (stored) return stored;
        const fresh = randomDeviceId();
        await AsyncStorage.setItem(KEY_DEVICE_ID, fresh);
        return fresh;
      } catch {
        // Storage indisponível: um id efémero é melhor do que falhar — o
        // handoff continua a funcionar, só não sobrevive a um reinício.
        return randomDeviceId();
      }
    })();
    idPromise.then((id) => {
      cachedId = id;
    });
  }
  return idPromise;
}

/** Para hot paths de render, depois de `getDeviceId()` já ter resolvido. */
export function getDeviceIdSync(): string | null {
  return cachedId;
}

export async function getDeviceName(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(KEY_DEVICE_NAME);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // ignorar — cai no nome por omissão
  }
  return defaultDeviceName();
}

/** O utilizador pode renomear o dispositivo nas Definições. */
export async function setDeviceName(name: string): Promise<void> {
  await AsyncStorage.setItem(KEY_DEVICE_NAME, name.trim().slice(0, 40));
}
