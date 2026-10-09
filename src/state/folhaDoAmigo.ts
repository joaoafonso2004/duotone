import { create } from 'zustand';

/**
 * A folha "o que ele está a ouvir" (9/10, docs/PLANO-SOCIAL-IOS.md). Uma só,
 * montada no navegador do iPhone, aberta da fila "Listening now" do Social e
 * dos amigos no topo da Home.
 */
export const useFolhaDoAmigo = create<{ amigoId: string | null }>(() => ({ amigoId: null }));

export const abrirFolhaDoAmigo = (amigoId: string) => useFolhaDoAmigo.setState({ amigoId });
export const fecharFolhaDoAmigo = () => useFolhaDoAmigo.setState({ amigoId: null });
