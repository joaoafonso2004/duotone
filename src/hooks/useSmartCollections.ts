import { useCallback, useEffect, useRef, useState } from 'react';
import { getLikedSongs } from '../api/library';
import { readLikedSongsCache } from '../lib/likedSongsCache';
import { getAllPlayCounts, readCachedPlayCounts, type PlayCountEntry } from '../lib/playCounts';
import { useAuth } from '../state/auth';
import type { Track } from '../types';

/** Cache-first: a página abre offline e refresca servidor/histórico em fundo. */
export function useSmartCollectionsData(offline=false){
  const userId=useAuth(s=>s.session?.user.id??s.offlineUserId);
  const [tracks,setTracks]=useState<Track[]>([]);
  const [history,setHistory]=useState<PlayCountEntry[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const generation=useRef(0);

  const refresh=useCallback(async()=>{
    const run=++generation.current;
    setError('');
    if(!userId){setTracks([]);setHistory([]);setLoading(false);return;}
    const [cachedTracks,cachedHistory]=await Promise.all([readLikedSongsCache(userId),readCachedPlayCounts()]);
    if(run!==generation.current)return;
    setTracks(cachedTracks);setHistory(cachedHistory);setLoading(false);
    if(offline)return;
    const [remoteTracks,remoteHistory]=await Promise.allSettled([getLikedSongs(),getAllPlayCounts()]);
    if(run!==generation.current)return;
    if(remoteTracks.status==='fulfilled')setTracks(remoteTracks.value);
    if(remoteHistory.status==='fulfilled')setHistory(remoteHistory.value);
    if(remoteTracks.status==='rejected'||remoteHistory.status==='rejected')setError('Some smart filters could not refresh. Cached results are shown.');
  },[offline,userId]);

  useEffect(()=>()=>{generation.current++;},[]);
  return {tracks,history,loading,error,refresh};
}
