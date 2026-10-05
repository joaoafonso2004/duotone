import React from 'react';
import { Page } from '../ui.web';
import { SocialHub } from '../../components/SocialHub';

/** Para onde o Social leva (perfis, playlists, artistas) é o `irPara` da casca (5/10, lib/destinos.ts). */
export function SocialPage({friendId,groupId,visible=true}: {friendId?:string;groupId?:string;visible?:boolean}) {
  return <Page title="Social"><SocialHub initialFriend={friendId} initialGroup={groupId} visible={visible}/></Page>;
}
