import { AppState,Platform } from 'react-native';
import { create } from 'zustand';
import type { NetInfoState } from '@react-native-community/netinfo';

/** `dadosMoveis`: a ligação é a rede do telemóvel, que se paga. Decide quantas
 * faixas o Smart Cache adianta (lib/adiantarFaixas.ts). */
type State={offline:boolean;checking:boolean;revision:number;dadosMoveis:boolean};
export const useConnectivity=create<State>(()=>({offline:Platform.OS==='ios',checking:Platform.OS==='ios',revision:0,dadosMoveis:false}));
const netInfo=()=>require('@react-native-community/netinfo').default as typeof import('@react-native-community/netinfo').default;
/**
 * Uma resposta do Supabase prova que há internet (26/11, a 7.2.0 "não tá a dar"
 * no iPhone): o NetInfo só acredita num pedido ao Google, e com esse pedido a
 * falhar (bloqueado, ou o primeiro de uma app acabada de instalar) a app ficava em
 * "Offline" com a rede a funcionar. Até 10 min depois da última resposta, conta
 * como ligada se o telefone tiver ligação. Não faz pedidos: ouve os que já há
 * (`aoChegarRespostaDoSupabase`, ligado no App.tsx).
 */
const CONFIRMACAO_MS=10*60*1000;
let confirmadoAte=0;
let ultimo:NetInfoState|null=null;
const confirmado=()=>Date.now()<confirmadoAte;
export function confirmarLigacao():void{
  if(Platform.OS!=='ios')return;
  const ja=confirmado();
  confirmadoAte=Date.now()+CONFIRMACAO_MS;
  if(!ja&&useConnectivity.getState().offline&&ultimo?.isConnected!==false){
    useConnectivity.setState(s=>({offline:false,checking:false,revision:s.revision+1}));
  }
}
/** Um pedido ao Supabase falhou sem resposta (um túnel): volta a valer o que o NetInfo diz. */
export function desconfirmarLigacao():void{
  if(Platform.OS!=='ios'||!confirmado())return;
  confirmadoAte=0;
  if(ultimo)receive(ultimo);
}
const receive=(state:NetInfoState)=>{
  ultimo=state;
  const offline=state.isConnected===false||(!confirmado()&&(state.isConnected!==true||state.isInternetReachable!==true));
  useConnectivity.setState(s=>({offline,checking:offline&&state.isConnected!==false&&state.isInternetReachable===null,revision:s.revision+(s.offline&&!offline?1:0),dadosMoveis:state.type==='cellular'}));
};
export async function refreshConnectivity():Promise<void>{
  if(Platform.OS!=='ios')return;
  try{receive(await netInfo().refresh());}catch{useConnectivity.setState({offline:!confirmado(),checking:false});}
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
