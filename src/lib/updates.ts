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
export const SIDELOADLY_URL = 'https://sideloadly.io/';

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
  /** Esta versão está abaixo da mínima: o aviso não se fecha (ver `versaoMinimaDasNotas`). */
  obrigatoria: boolean;
}

/**
 * A versão mínima, escrita nas notas da versão (11/11).
 *
 * As notas do `versions.json` são o texto da release no GitHub (o portfólio
 * copia-o), por isso tornar uma atualização obrigatória é escrever uma linha
 * nas notas ao publicar -- ou editar a release depois:
 *
 *     Minimum version: 5.8.7
 *
 * Quem estiver abaixo dessa versão vê o aviso sem o "Not now". A linha não
 * aparece nas notas mostradas. Só as versões com este código a entendem (as
 * anteriores mostram-na como mais uma linha das notas, o que também avisa).
 */
const LINHA_DA_MINIMA = /^[ \t\-*]*(?:minimum version|vers[ãa]o m[íi]nima)\s*:\s*v?(\d+(?:\.\d+){1,2})\s*$/im;

export function versaoMinimaDasNotas(notas: string | null | undefined): string | null {
  return LINHA_DA_MINIMA.exec(notas ?? '')?.[1] ?? null;
}

export function notasSemMinima(notas: string | null | undefined): string {
  return (notas ?? '').split(/\r?\n/).filter((l) => !LINHA_DA_MINIMA.test(l)).join('\n').trim();
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
export async function checkForUpdate(
  /** O "Check for updates" das Definições: um pedido explícito passa por cima do "Not now". */
  opcoes: { ignorarDispensa?: boolean; atirarErro?: boolean } = {},
): Promise<UpdateInfo | null> {
  const platform = currentPlatform();
  if (!platform) return null;

  try {
    // cache: 'no-store' porque a CDN serve o ficheiro com cache longa e sem
    // isto a app podia ficar dias a ver uma versão já substituída.
    const controlador = new AbortController();
    const relogio = setTimeout(() => controlador.abort(), 15_000);
    let data: any;
    try {
      const res = await fetch(VERSIONS_URL, { cache: 'no-store', signal: controlador.signal });
      if (!res.ok) throw new Error(`versions.json HTTP ${res.status}`);
      data = await res.json();
    } finally {
      clearTimeout(relogio);
    }

    const release: PlatformRelease | null = data?.apps?.[APP_ID]?.[platform] ?? null;
    if (!release?.version || !release.asset) return null;

    if (compareVersions(release.version, APP_VERSION) <= 0) return null;
    const minima = versaoMinimaDasNotas(release.notes);
    const obrigatoria = !!minima && compareVersions(APP_VERSION, minima) < 0;
    // Um "Not now" antigo não cala uma atualização obrigatória.
    if (!obrigatoria && !opcoes.ignorarDispensa && await wasDismissed(platform, release.version)) return null;

    return {
      platform,
      current: APP_VERSION,
      latest: release.version,
      notes: notasSemMinima(release.notes),
      install: release.install,
      obrigatoria,
    };
  } catch (erro) {
    if (opcoes.atirarErro) throw erro;
    return null;
  }
}
