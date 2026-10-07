import {getSocialProfileTracks,getProfileHighlights} from './profiles';
import {listPlaylists,listProfilePlaylists,copiasGuardadas} from './playlists';

/** Secções independentes: uma falha de personalização não apaga o histórico. */
export async function loadProfileSections(userId:string,own:boolean,canView:boolean) {
  const [most,recent,playlists,copies,highlights]=await Promise.allSettled([
    canView?getSocialProfileTracks(userId):Promise.resolve([]),
    canView?getSocialProfileTracks(userId,true):Promise.resolve([]),
    // No perfil só as de que se é DONO: a visibilidade é dele (7/10).
    own?listPlaylists().then(l=>l.filter(p=>!p.souColaborador)):canView?listProfilePlaylists(userId):Promise.resolve([]),
    !own&&canView?copiasGuardadas():Promise.resolve(new Set<string>()),
    canView?getProfileHighlights(userId):Promise.resolve({playlistIds:[],moment:null}),
  ]);
  return {most,recent,playlists,copies,highlights};
}
