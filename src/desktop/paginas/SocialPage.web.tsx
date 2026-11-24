import React, { useState } from 'react';
import { Page } from '../ui.web';
import { SocialHub } from '../../components/SocialHub';
import { AcaoDeTexto } from '../../components/SocialPc.web';
import type { AlbumDaPagina } from '../../api/albunsDoArtista';
import { legendaDoAlbumPartilhado } from '../../lib/albumPartilhado';
import type { CommonPageProps, OrigemDoMenu } from '../rotas';
import type { Track } from '../../types';
import { useDialogoDoAlbum } from './BibliotecaPages.web';

/**
 * Para onde o Social leva (perfis, playlists, artistas) é o `irPara` da casca (5/10, lib/destinos.ts).
 * Um álbum mandado numa mensagem (16/11) abre o diálogo do álbum das outras páginas.
 * "New chat" é uma ação do cabeçalho da página (22/11, a B4): o ícone e o texto, sem
 * pílula, no lugar do `person-add` solto que ficava por cima da lista.
 */
export function SocialPage({friendId,groupId,visible=true,aoMenuDaFaixa,...props}: {friendId?:string;groupId?:string;visible?:boolean;
  /** O menu de uma música da app (30/10): as músicas do Social deixam de abrir a folha antiga. */
  aoMenuDaFaixa?:(t:Track,origem?:OrigemDoMenu)=>void} & CommonPageProps) {
  const dialogo = useDialogoDoAlbum(props);
  const [novaConversa, setNovaConversa] = useState(false);
  return <>
    <Page title="Social" action={<AcaoDeTexto rotulo="Start a conversation" icone="create-outline" texto="New chat" onPress={() => setNovaConversa(true)}/>}>
      <SocialHub initialFriend={friendId} initialGroup={groupId} visible={visible} aoMenuDaFaixa={aoMenuDaFaixa}
        novaConversa={{ aberta: novaConversa, definir: setNovaConversa }}
        aoAbrirAlbum={(a)=>void dialogo.abrirAlbum({ id: a.id, title: a.titulo, artworkUrl: a.capa, channelTitle: legendaDoAlbumPartilhado(a), tipo: a.tipo ?? 'Album', ano: a.ano } as AlbumDaPagina)}/></Page>
    {dialogo.dialogoDoAlbum}
  </>;
}
