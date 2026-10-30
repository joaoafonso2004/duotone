import React from 'react';
import { Page } from '../ui.web';
import { SocialHub } from '../../components/SocialHub';
import type { Track } from '../../types';

/** Para onde o Social leva (perfis, playlists, artistas) é o `irPara` da casca (5/10, lib/destinos.ts). */
export function SocialPage({friendId,groupId,visible=true,aoMenuDaFaixa}: {friendId?:string;groupId?:string;visible?:boolean;
  /** O menu de uma música da app (30/10): as músicas do Social deixam de abrir a folha antiga. */
  aoMenuDaFaixa?:(t:Track)=>void}) {
  return <Page title="Social"><SocialHub initialFriend={friendId} initialGroup={groupId} visible={visible} aoMenuDaFaixa={aoMenuDaFaixa}/></Page>;
}
