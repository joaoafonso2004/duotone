import { File, Paths } from 'expo-file-system';

const PREFIX = 'yt-audio-';

/** Cache local do áudio (mp4 progressivo) por videoId — evita descarregar
 * outra vez ao voltar a tocar a mesma faixa (ver YouTubePlayerView). */
export function cachedAudioFile(videoId: string): File {
  return new File(Paths.cache, `${PREFIX}${videoId}.m4a`);
}

/** Apaga todo o áudio de YouTube descarregado localmente (Definições > Clear cache). */
export function clearDownloadedAudioCache(): void {
  for (const entry of Paths.cache.list()) {
    if (entry instanceof File && entry.name.startsWith(PREFIX)) {
      entry.delete();
    }
  }
}
