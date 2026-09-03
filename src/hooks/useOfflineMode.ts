import { Platform } from 'react-native';
import { useConnectivity } from '../state/connectivity';
import { useAuth } from '../state/auth';
export function useOfflineMode():boolean {
  const offline=useConnectivity(s=>s.offline),session=useAuth(s=>s.session);
  return Platform.OS==='ios'&&(offline||!session);
}
