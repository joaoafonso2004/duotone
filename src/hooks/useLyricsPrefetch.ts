import {useEffect,useState} from 'react';
import {AppState,Platform} from 'react-native';
import {usePlayer} from '../state/player';
import {useConnectivity} from '../state/connectivity';
import {ensureLyrics} from '../state/lyrics';
import {appEstaVisivel} from '../lib/appVisibility';

export function useLyricsPrefetch(){
  const current=usePlayer(s=>s.current),queue=usePlayer(s=>s.queue),order=usePlayer(s=>s.shuffleOrder);
  const shuffle=usePlayer(s=>s.shuffle),repeat=usePlayer(s=>s.repeatMode),offline=useConnectivity(s=>s.offline);
  const [visivel,setVisivel]=useState(appEstaVisivel);
  useEffect(()=>{
    const atualizar=()=>setVisivel(appEstaVisivel());
    const app=AppState.addEventListener('change',atualizar);
    if(Platform.OS==='web')document.addEventListener('visibilitychange',atualizar);
    return()=>{app.remove();if(Platform.OS==='web')document.removeEventListener('visibilitychange',atualizar);};
  },[]);
  useEffect(()=>{
    let cancelled=false;
    // Letras são interface. Uma mudança automática de faixa com o ecrã
    // bloqueado não deve fazer duas pesquisas e processamento que ninguém vê;
    // ao voltar a active este efeito corre e prepara-as.
    if(visivel&&current)void ensureLyrics(current).then(()=>{
      if(cancelled||offline)return;
      const next=usePlayer.getState().peekNextTrack();
      if(next)void ensureLyrics(next);
    });
    return()=>{cancelled=true;};
  },[current,queue,order,shuffle,repeat,offline,visivel]);
}
