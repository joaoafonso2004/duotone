import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Foto de perfil (avatar), guardada LOCALMENTE. A imagem escolhida é copiada
 * para a pasta de documentos da app e o caminho fica no AsyncStorage — assim
 * não depende de a foto original continuar acessível na galeria nem de um
 * bucket no Supabase. É pessoal, chega bem no dispositivo.
 */

const KEY = 'profile:avatarUri';

function avatarDir(): Directory {
  return new Directory(Paths.document, 'profile');
}

export async function getAvatarUri(): Promise<string | null> {
  const uri = await AsyncStorage.getItem(KEY);
  if (!uri) return null;
  try {
    return new File(uri).exists ? uri : null;
  } catch {
    return null;
  }
}

/** Copia a imagem escolhida para a app e devolve o novo URI local. */
export async function setAvatarFromUri(sourceUri: string): Promise<string> {
  const dir = avatarDir();
  if (!dir.exists) dir.create({ intermediates: true });

  const ext = sourceUri.split('.').pop()?.split('?')[0] || 'jpg';
  const dest = new File(dir, `avatar_${Date.now()}.${ext}`);
  if (dest.exists) dest.delete();
  new File(sourceUri).copy(dest);

  // Apaga o avatar anterior, se houver.
  const prev = await AsyncStorage.getItem(KEY);
  if (prev && prev !== dest.uri) {
    try {
      const prevFile = new File(prev);
      if (prevFile.exists) prevFile.delete();
    } catch {
      // ignorar
    }
  }
  await AsyncStorage.setItem(KEY, dest.uri);
  return dest.uri;
}

export async function clearAvatar(): Promise<void> {
  const prev = await AsyncStorage.getItem(KEY);
  if (prev) {
    try {
      const f = new File(prev);
      if (f.exists) f.delete();
    } catch {
      // ignorar
    }
  }
  await AsyncStorage.removeItem(KEY);
}
