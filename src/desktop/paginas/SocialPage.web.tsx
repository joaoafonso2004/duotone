import React from 'react';
import { Page } from '../ui.web';
import { SocialHub } from '../../components/SocialHub';
import type { AlbumDaPagina } from '../../api/albunsDoArtista';
import { legendaDoAlbumPartilhado } from '../../lib/albumPartilhado';
import type { CommonPageProps } from '../rotas';
import type { Track } from '../../types';
import { useDialogoDoAlbum } from './BibliotecaPages.web';

/**
 * Para onde o Social leva (perfis, playlists, artistas) é o `irPara` da casca (5/10, lib/destinos.ts).
 * Um álbum mandado numa mensagem (16/11) abre o diálogo do álbum das outras páginas.
 */
export function SocialPage({friendId,groupId,visible=true,aoMenuDaFaixa,...props}: {friendId?:string;groupId?:string;visible?:boolean;
  /** O menu de uma música da app (30/10): as músicas do Social deixam de abrir a folha antiga. */
  aoMenuDaFaixa?:(t:Track)=>void} & CommonPageProps) {
  const dialogo = useDialogoDoAlbum(props);
  return <>
    <Page title="Social"><SocialHub initialFriend={friendId} initialGroup={groupId} visible={visible} aoMenuDaFaixa={aoMenuDaFaixa}
      aoAbrirAlbum={(a)=>void dialogo.abrirAlbum({ id: a.id, title: a.titulo, artworkUrl: a.capa, channelTitle: legendaDoAlbumPartilhado(a), tipo: a.tipo ?? 'Album', ano: a.ano } as AlbumDaPagina)}/></Page>
    {dialogo.dialogoDoAlbum}
  </>;
}
