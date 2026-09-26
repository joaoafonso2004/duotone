import React from 'react';
import { Page } from '../ui.web';
import { SocialHub } from '../../components/SocialHub';
import type { Route } from '../rotas';
import type { Track } from '../../types';

export function SocialPage({navigate,friendId,groupId,visible=true}: {navigate:(r:Route)=>void;friendId?:string;groupId?:string;visible?:boolean;notify:(s:string)=>void;play:(t:Track,q?:Track[])=>void;more:(t:Track)=>void}) {
  return <Page title="Social"><SocialHub initialFriend={friendId} initialGroup={groupId} visible={visible}
    onProfile={userId=>navigate({name:'friend-profile',userId})}
    onArtist={value=>navigate({name:'artist',value})}
    onPlaylist={id=>navigate({name:'playlist',id,title:'Playlist partilhada'})}/></Page>;
}
