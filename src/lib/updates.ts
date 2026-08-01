import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { APP_VERSION } from './buildInfo';

/**
 * Verificação de atualizações contra o portfólio.
 *
 * As versões de iOS e Windows são independentes: cada plataforma só olha
 * para a sua entrada no versions.json, por isso lançar uma versão de iOS
 * nunca faz aparecer um aviso nos PCs, e vice-versa.
 */

const VERSIONS_URL = 'https://joaoafonso.vercel.app/ota/versions.json';
export const PORTFOLIO_URL = 'https://joaoafonso.vercel.app/#apps';

const APP_ID = 'duotone';

export type UpdatePlatform = 'ios' | 'windows';

interface PlatformRelease {
  version: string;
  tag: string;
  notes: string;
  publishedAt: string;
  releaseUrl: string;
  asset: { name: string; size: number; url: string } | null;
  install: string;
}

export interface UpdateInfo {
  platform: UpdatePlatform;
  current: string;
  latest: string;
  notes: string;
  install: string;
}

/** Em que plataforma corremos, do ponto de vista de distribuição. */
export function currentPlatform(): UpdatePlatform | null {
  // O desktop é o mesmo bundle web dentro do Electron; a ponte injetada no
  // preload é o único sinal fiável de que não é um browser normal.
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' && window.duotoneDesktop ? 'windows' : null;
  }
  return Platform.OS === 'ios' ? 'ios' : null;
}

/**
 * Compara duas versões semânticas.
 * Devolve >0 se `a` for mais recente que `b`, 0 se iguais, <0 caso contrário.
 *
 * Sufixos de pré-lançamento (1.2.0-beta.1) são ignorados na comparação
 * numérica e depois desempatados: uma versão com sufixo é sempre anterior
 * à mesma versão sem sufixo, como manda o SemVer.
 */
export function compareVersions(a: string, b: string): number {
  const split = (v: string) => {
    const [core, pre] = String(v).replace(/^v/, '').split('-');
    return {
      parts: core.split('.').map((n) => parseInt(n, 10) || 0),
      pre: pre ?? '',
    };
  };

  const va = split(a);
  const vb = split(b);
  const len = Math.max(va.parts.length, vb.parts.length);

  for (let i = 0; i < len; i++) {
    const diff = (va.parts[i] ?? 0) - (vb.parts[i] ?? 0);
    if (diff !== 0) return diff;
  }

  if (va.pre === vb.pre) return 0;
  if (!va.pre) return 1;
  if (!vb.pre) return -1;
  return va.pre < vb.pre ? -1 : 1;
}

/* A dispensa é por versão e por plataforma: dispensar a 1.2.0 no iPhone não
   silencia a 1.3.0, nem afeta o aviso no PC. */
const dismissKey = (platform: UpdatePlatform) => `update:dismissed:${platform}`;

export async function dismissUpdate(platform: UpdatePlatform, version: string): Promise<void> {
  await AsyncStorage.setItem(dismissKey(platform), version);
}

async function wasDismissed(platform: UpdatePlatform, version: string): Promise<boolean> {
  return (await AsyncStorage.getItem(dismissKey(platform))) === version;
}

/**
 * Devolve os dados da atualização se houver uma mais recente, ou null.
 * Nunca atira: uma falha de rede no arranque não pode impedir a app de abrir.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const platform = currentPlatform();
  if (!platform) return null;

  try {
    // cache: 'no-store' porque a CDN serve o ficheiro com cache longa e sem
    // isto a app podia ficar dias a ver uma versão já substituída.
    const res = await fetch(VERSIONS_URL, { cache: 'no-store' });
    if (!res.ok) return null;

    const data = await res.json();
    const release: PlatformRelease | null = data?.apps?.[APP_ID]?.[platform] ?? null;
    if (!release?.version || !release.asset) return null;

    if (compareVersions(release.version, APP_VERSION) <= 0) return null;
    if (await wasDismissed(platform, release.version)) return null;

    return {
      platform,
      current: APP_VERSION,
      latest: release.version,
      notes: (release.notes ?? '').trim(),
      install: release.install,
    };
  } catch {
    return null;
  }
}
