import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Avatar personalizável SEM dependências nativas: um emoji à escolha sobre um
 * gradiente à escolha. Guardado localmente (AsyncStorage). Substitui a foto da
 * galeria (que exigia um módulo nativo) — dá personalização com risco zero.
 */

const KEY_EMOJI = 'profile:avatarEmoji';
const KEY_GRADIENT = 'profile:avatarGradient';

/** Gradientes disponíveis (pares de cores para o LinearGradient). */
export const AVATAR_GRADIENTS: readonly [string, string][] = [
  ['#7C3AED', '#DB2777'], // roxo → rosa (aurora)
  ['#2563EB', '#22D3EE'], // azul → ciano
  ['#F43F5E', '#F59E0B'], // vermelho → âmbar
  ['#10B981', '#84CC16'], // verde → lima
  ['#8B5CF6', '#3B82F6'], // violeta → azul
  ['#EC4899', '#8B5CF6'], // rosa → violeta
  ['#F97316', '#EF4444'], // laranja → vermelho
  ['#14B8A6', '#6366F1'], // teal → indigo
];

export const AVATAR_EMOJIS: readonly string[] = [
  '🎧', '🎵', '🎸', '🎹', '🎤', '🔥', '⭐️', '🌙',
  '🚀', '👾', '🐺', '🦊', '🐉', '🌊', '⚡️', '💜',
];

export const DEFAULT_EMOJI = AVATAR_EMOJIS[0];
export const DEFAULT_GRADIENT_INDEX = 0;

export interface AvatarChoice {
  emoji: string;
  gradientIndex: number;
}

export async function getAvatarChoice(): Promise<AvatarChoice> {
  const [emoji, gradientRaw] = await Promise.all([
    AsyncStorage.getItem(KEY_EMOJI),
    AsyncStorage.getItem(KEY_GRADIENT),
  ]);
  const gradientIndex = Number(gradientRaw);
  return {
    emoji: emoji ?? DEFAULT_EMOJI,
    gradientIndex:
      Number.isInteger(gradientIndex) && gradientIndex >= 0 && gradientIndex < AVATAR_GRADIENTS.length
        ? gradientIndex
        : DEFAULT_GRADIENT_INDEX,
  };
}

export async function setAvatarChoice(choice: AvatarChoice): Promise<void> {
  await AsyncStorage.multiSet([
    [KEY_EMOJI, choice.emoji],
    [KEY_GRADIENT, String(choice.gradientIndex)],
  ]);
}
