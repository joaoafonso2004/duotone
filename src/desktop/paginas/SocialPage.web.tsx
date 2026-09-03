import React from 'react';
import { Page } from '../ui.web';
import { SocialHub } from '../../components/SocialHub';
import type { Route } from '../rotas';
import type { Track } from '../../types';

export function SocialPage({navigate,friendId,groupId}: {navigate:(r:Route)=>void;friendId?:string;groupId?:string;notify:(s:string)=>void;play:(t:Track,q?:Track[])=>void;more:(t:Track)=>void}) {
  return <Page title="Social" subtitle="Friends, music and conversations."><SocialHub initialFriend={friendId} initialGroup={groupId}
    onProfile={userId=>navigate({name:'friend-profile',userId})}
    onArtist={value=>navigate({name:'artist',value})}
    onPlaylist={id=>navigate({name:'playlist',id,title:'Playlist partilhada'})}/></Page>;
}
