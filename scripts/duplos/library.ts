/**
 * Duplo de src/api/library.ts.
 *
 * A `store` só usa o `getLibrary` -- o Smart Shuffle não sugere o que ele já
 * guardou -- e esse devolve o `controlo.biblioteca`. Os outros existem porque o
 * duplo vale para TODOS os testes com duplos: um import que falte aqui rebenta o
 * arranque com "does not provide an export named" (ver a nota do duplo das
 * plays). Mudos de propósito.
 */
import { controlo } from './controlo.ts';
import type { Track } from '../../src/types.ts';

export const trackKey = (t: Pick<Track, 'source' | 'sourceId'>) => `${t.source}:${t.sourceId}`;
export const getLibrary = (): Promise<Track[]> => Promise.resolve([...controlo.biblioteca]);
export const getLikedSongs = (): Promise<Track[]> => Promise.resolve([...controlo.biblioteca]);
export const getLibraryKeys = (): Promise<Set<string>> =>
  Promise.resolve(new Set(controlo.biblioteca.map(trackKey)));
export const getLibraryTrackIds = (): Promise<Set<string>> => Promise.resolve(new Set());
export const checkIsSaved = (): Promise<boolean> => Promise.resolve(false);
export const currentUserId = (): Promise<string> => Promise.resolve('utilizador-de-teste');
export const upsertTrack = (t: Track): Promise<string> => Promise.resolve(trackKey(t));
export const upsertTracks = (): Promise<Map<string, string>> => Promise.resolve(new Map());
export const saveToLibrary = (t: Track): Promise<string> => Promise.resolve(trackKey(t));
export const removeFromLibrary = (): Promise<void> => Promise.resolve();
export const removeMultipleFromLibrary = (): Promise<void> => Promise.resolve();
export const clearLibrary = (): Promise<void> => Promise.resolve();
