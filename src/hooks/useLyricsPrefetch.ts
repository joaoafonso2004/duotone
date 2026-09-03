import {useEffect} from 'react';
import {usePlayer} from '../state/player';
import {useConnectivity} from '../state/connectivity';
import {ensureLyrics} from '../state/lyrics';

export function useLyricsPrefetch(){
  const current=usePlayer(s=>s.current),queue=usePlayer(s=>s.queue),order=usePlayer(s=>s.shuffleOrder);
  const shuffle=usePlayer(s=>s.shuffle),repeat=usePlayer(s=>s.repeatMode),offline=useConnectivity(s=>s.offline);
  useEffect(()=>{
    let cancelled=false;
    if(current)void ensureLyrics(current).then(()=>{
      if(cancelled||offline)return;
      const next=usePlayer.getState().peekNextTrack();
      if(next)void ensureLyrics(next);
    });
    return()=>{cancelled=true;};
  },[current,queue,order,shuffle,repeat,offline]);
}
