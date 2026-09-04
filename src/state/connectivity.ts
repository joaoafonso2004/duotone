import { AppState,Platform } from 'react-native';
import { create } from 'zustand';
import type { NetInfoState } from '@react-native-community/netinfo';

type State={offline:boolean;checking:boolean;expensive:boolean;revision:number};
export const useConnectivity=create<State>(()=>({offline:Platform.OS==='ios',checking:Platform.OS==='ios',expensive:false,revision:0}));
const netInfo=()=>require('@react-native-community/netinfo').default as typeof import('@react-native-community/netinfo').default;
const receive=(state:NetInfoState)=>{
  const offline=state.isConnected!==true||state.isInternetReachable!==true;
  const expensive=!!(state.details as {isConnectionExpensive?:boolean}|null)?.isConnectionExpensive;
  useConnectivity.setState(s=>({offline,expensive,checking:state.isConnected!==false&&state.isInternetReachable===null,revision:s.revision+(s.offline&&!offline?1:0)}));
};
export async function refreshConnectivity():Promise<void>{
  if(Platform.OS!=='ios')return;
  try{receive(await netInfo().refresh());}catch{useConnectivity.setState({offline:true,checking:false});}
}
/** Uma única subscrição. Wi-Fi e dados móveis contam como internet. */
export function startConnectivity():()=>void {
  if(Platform.OS!=='ios')return()=>{};
  const net=netInfo();
  net.configure({useNativeReachability:false,reachabilityRequestTimeout:5000,reachabilityShortTimeout:5000,reachabilityLongTimeout:30000});
  const unsubscribe=net.addEventListener(receive);
  const foreground=AppState.addEventListener('change',state=>{if(state==='active')void refreshConnectivity();});
  void refreshConnectivity();
  return()=>{unsubscribe();foreground.remove();};
}
