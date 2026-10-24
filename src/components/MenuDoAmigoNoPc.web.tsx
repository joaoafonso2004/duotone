import React, { useCallback, useEffect, useState } from 'react';
import { sessoesDeAmigos } from '../api/ouvirJuntos';
import type { Friendship } from '../api/social';
import { ConfirmarRemoverAmigo, MenuDoAmigo } from '../desktop/MenuDoAmigo.web';
import { pontoDoEvento, type PontoNoEcra } from '../desktop/MenuDeContexto.web';
import { avisarFeito } from '../lib/avisoDeRemocao';
import { useSocial } from '../state/social';
import type { AbrirMenuDoAmigo } from './MenuDoAmigoNoPc';

/**
 * O botão direito num amigo fora da lateral (24/10, fase 2 de
 * docs/botao-direito-pc-maquete.html): na lista do Social, nos participantes
 * da Jam e no perfil dele. O mesmo menu da lateral (`desktop/MenuDoAmigo.web.tsx`).
 *
 * Quem não é amigo (ainda pendente, ou um participante que não conheces) não
 * tem menu: as linhas são todas de um amigo. A Jam dele só se pergunta quando
 * ele está a ouvir alguma coisa (é aí que "ouvir com" a usa): um pedido por
 * menu aberto, e nenhum para os outros.
 */
export function useMenuDoAmigoNoPc(notify: (texto: string) => void = (t) => { avisarFeito(t); }) {
  const [menu, setMenu] = useState<{ amigoId: string; rato: PontoNoEcra; naTuaJam: boolean } | null>(null);
  const [aRemover, setARemover] = useState<Friendship | null>(null);
  const abrirMenuDoAmigo = useCallback<AbrirMenuDoAmigo>((amigoId, e, opcoes) => {
    const aceite = useSocial.getState().friends.some((f) => f.friendId === amigoId && f.status === 'accepted');
    if (!aceite) return;
    e?.preventDefault?.();
    setMenu({ amigoId, rato: pontoDoEvento(e), naTuaJam: !!opcoes?.naTuaJam });
  }, []);
  // O menu segue o amigo pela lista atual (a música dele pode mudar com ele aberto).
  const amigo = useSocial((s) => (menu ? s.friends.find((f) => f.friendId === menu.amigoId) ?? null : null));
  const aOuvir = !!amigo?.currentlyPlaying;
  const [sessaoDele, setSessaoDele] = useState<string | null>(null);
  useEffect(() => {
    setSessaoDele(null);
    if (!menu || !aOuvir || menu.naTuaJam) return;
    let vivo = true;
    void sessoesDeAmigos().then((m) => { if (vivo) setSessaoDele(m.get(menu.amigoId) ?? null); }).catch(() => {});
    return () => { vivo = false; };
  }, [menu?.amigoId, aOuvir, menu?.naTuaJam]);

  const menuDoAmigo = <>
    {menu && amigo ? <MenuDoAmigo key={`${menu.amigoId}:${menu.rato.x}:${menu.rato.y}`} amigo={amigo} sessaoDele={sessaoDele}
      rato={menu.rato} naTuaJam={menu.naTuaJam} aoFechar={() => setMenu(null)} aoPedirRemover={setARemover} notify={notify} /> : null}
    <ConfirmarRemoverAmigo amigo={aRemover} aoFechar={() => setARemover(null)} notify={notify} />
  </>;
  return { abrirMenuDoAmigo, menuDoAmigo };
}
