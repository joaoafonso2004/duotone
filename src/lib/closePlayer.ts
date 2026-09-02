import { usePlayer } from '../state/player';

export const CLOSE_FADE_MS=300;
export function confirmaSwipe(dx:number,dy:number,vx:number,width:number):boolean {
  return dx>0 && Math.abs(dx)>Math.abs(dy)*1.3 && (dx>width*0.35 || (dx>28&&vx>0.8));
}
let pending:Promise<void>|null=null;
/** O ganho é transitório: não altera volume, mute ou preferências guardadas. */
export function closePlayerSmoothly():Promise<void> {
  if(usePlayer.getState().closing&&pending)return pending;
  const track=usePlayer.getState().current;if(!track)return Promise.resolve();
  usePlayer.setState({closing:true,closeGain:1});
  const start=Date.now();
  const operation=new Promise<void>(resolve=>{
    const timer=setInterval(()=>{
      const state=usePlayer.getState();
      if(!state.closing||state.current!==track){clearInterval(timer);state._yt?.setVolume?.(state.volume);resolve();return;}
      const gain=Math.max(0,1-(Date.now()-start)/CLOSE_FADE_MS);
      usePlayer.setState({closeGain:gain});
      try { state._yt?.setVolume?.(state.volume*gain); } catch { /* O motor pode já ter sido desmontado. */ }
      if(gain===0){clearInterval(timer);void state.close().then(resolve,()=>{usePlayer.setState({closing:false,closeGain:1});resolve();});}
    },16);
  });
  pending=operation;
  void operation.finally(()=>{if(pending===operation)pending=null;});
  return operation;
}
