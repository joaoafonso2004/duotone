import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export function useReducedMotion() {
  const [reduced,setReduced]=useState(false);
  useEffect(()=>{
    if(Platform.OS==='web'){
      const media=window.matchMedia('(prefers-reduced-motion: reduce)');
      const update=()=>setReduced(media.matches);update();media.addEventListener('change',update);
      return()=>media.removeEventListener('change',update);
    }
    let alive=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setReduced(v);});
    const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    return()=>{alive=false;sub.remove();};
  },[]);
  return reduced;
}
