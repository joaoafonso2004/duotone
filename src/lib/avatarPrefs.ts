import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * Avatar personalizável: um emoji + gradiente, uma ilustração curada ou um link de imagem (URL).
 * Guardado localmente (AsyncStorage) e sincronizado com o Supabase Auth (user_metadata)
 * e com a tabela public.profiles para persistência e compartilhamento.
 */

const KEY_EMOJI = 'profile:avatarEmoji';
const KEY_GRADIENT = 'profile:avatarGradient';
const KEY_URL = 'profile:avatarUrl';

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

/** Ilustrações de música curadas (Unsplash CDN de alta qualidade). */
export const CURATED_AVATARS: readonly string[] = [
  'https://images.unsplash.com/photo-1539628399243-73401140326b?w=200&h=200&fit=crop', // Vinyl Record
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&h=200&fit=crop', // DJ Deck
  'https://images.unsplash.com/photo-1544785316-6e58aed68a50?w=200&h=200&fit=crop', // Cassette
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=200&h=200&fit=crop', // Headphones
  'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=200&h=200&fit=crop', // Guitar
  'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=200&h=200&fit=crop', // Synth
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop', // Lofi Mic
  'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=200&h=200&fit=crop', // Live Stage
];

export const DEFAULT_EMOJI = AVATAR_EMOJIS[0];
export const DEFAULT_GRADIENT_INDEX = 0;

export interface AvatarChoice {
  emoji?: string;
  gradientIndex?: number;
  avatarUrl?: string; // URL de imagem personalizada ou ilustrada
}

export async function getAvatarChoice(): Promise<AvatarChoice> {
  // Tentar primeiro obter do metadado de utilizador do Supabase (Cloud)
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.user_metadata) {
      const emoji = user.user_metadata.avatar_emoji;
      const gradientRaw = user.user_metadata.avatar_gradient;
      const avatarUrl = user.user_metadata.avatar_url;
      
      return {
        emoji: emoji || DEFAULT_EMOJI,
        gradientIndex:
          gradientRaw !== undefined && Number(gradientRaw) >= 0 && Number(gradientRaw) < AVATAR_GRADIENTS.length
            ? Number(gradientRaw)
            : DEFAULT_GRADIENT_INDEX,
        avatarUrl: avatarUrl || undefined,
      };
    }
  } catch (err) {
    console.error('Error getting avatar choice from Supabase:', err);
  }

  // Fallback para AsyncStorage local
  const [emoji, gradientRaw, avatarUrl] = await Promise.all([
    AsyncStorage.getItem(KEY_EMOJI),
    AsyncStorage.getItem(KEY_GRADIENT),
    AsyncStorage.getItem(KEY_URL),
  ]);
  const gradientIndex = Number(gradientRaw);
  return {
    emoji: emoji ?? DEFAULT_EMOJI,
    gradientIndex:
      Number.isInteger(gradientIndex) && gradientIndex >= 0 && gradientIndex < AVATAR_GRADIENTS.length
        ? gradientIndex
        : DEFAULT_GRADIENT_INDEX,
    avatarUrl: avatarUrl ?? undefined,
  };
}

export async function setAvatarChoice(choice: AvatarChoice): Promise<void> {
  // Guardar localmente
  const ops = [
    AsyncStorage.setItem(KEY_EMOJI, choice.emoji || DEFAULT_EMOJI),
    AsyncStorage.setItem(KEY_GRADIENT, String(choice.gradientIndex ?? DEFAULT_GRADIENT_INDEX)),
  ];
  if (choice.avatarUrl) {
    ops.push(AsyncStorage.setItem(KEY_URL, choice.avatarUrl));
  } else {
    ops.push(AsyncStorage.removeItem(KEY_URL));
  }
  await Promise.all(ops);

  // Sincronizar na Cloud através do user_metadata do Supabase Auth e tabela profiles
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.auth.updateUser({
      data: {
        avatar_emoji: choice.emoji || DEFAULT_EMOJI,
        avatar_gradient: String(choice.gradientIndex ?? DEFAULT_GRADIENT_INDEX),
        avatar_url: choice.avatarUrl || null,
      },
    });
    if (error) throw error;

    if (user?.id) {
      await supabase
        .from('profiles')
        .update({ avatar_url: choice.avatarUrl || null })
        .eq('id', user.id);
    }
  } catch (err) {
    console.error('Error syncing avatar choice to Supabase:', err);
  }
}
