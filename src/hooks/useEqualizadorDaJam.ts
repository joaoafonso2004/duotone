import { useEffect } from 'react';
import { useOuvirJuntos } from '../state/ouvirJuntos';
import { usePlayer } from '../state/player';
import { getDeviceId } from '../lib/deviceIdentity';
import { ligarEqualizadorDaJam } from '../lib/eqDoJam';

/** Uma ligação por ativação, partilhada pelo leitor do iPhone e pelo PC. */
export function useEqualizadorDaJam(): void {
  const eu = useOuvirJuntos(s => s.euId);
  const modo = useOuvirJuntos(s => s.sessao?.eqPartilhado && s.sessao.eqEmissao
    ? `${s.sessao.id}:${s.sessao.hostId}:${s.sessao.eqEmissao}` : null);
  useEffect(() => {
    let vivo = true, parar = () => {};
    usePlayer.getState()._aplicarEqDaJam(null, false);
    if (modo && eu) void getDeviceId().then(dispositivo => {
      if (vivo) parar = ligarEqualizadorDaJam(dispositivo);
    });
    return () => { vivo = false; parar(); usePlayer.getState()._aplicarEqDaJam(null, false); };
  }, [modo, eu]);
}
