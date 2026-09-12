import { useEffect } from 'react';
import { Image } from 'expo-image';
import { Platform } from 'react-native';
import {
  capaDoPerfil, capasDeFaixas, capasDePlaylists, imagensAAquecer,
} from '../lib/aquecerImagens';
import { perfilEmCache } from '../lib/cachePerfil';
import { useConnectivity } from '../state/connectivity';
import { useRecomendacoes } from '../state/recomendacoes';

/**
 * As capas da Pesquisa e do perfil, pedidas durante a abertura.
 *
 * Os dados já vinham no arranque; as imagens é que esperavam pelo primeiro
 * toque no separador, e por isso a Pesquisa abria sempre a encher quadrados um
 * a um. Aqui pede-se a primeira fila de cada prateleira mal ela aterre -- e a
 * abertura dura ~1,3 s, tempo que chega para as de baixo da base de dados.
 *
 * **Só as primeiras de cada lista** (ver `lib/aquecerImagens.ts`): isto corre
 * no arranque, ao lado da resolução da faixa que vai tocar, e não pode ser a
 * app a puxar a biblioteca toda. Quem decide quantas é lá; aqui só se pede.
 *
 * Sem rede não faz nada, e falhar não diz nada a ninguém: uma capa que não
 * veio agora vem quando o ecrã a mostrar, como vinha antes.
 */

/** O que já se pediu nesta sessão, para não repetir a cada aterragem. */
const pedidas = new Set<string>();

function pedir(urls: readonly string[]): void {
  const novas = urls.filter((u) => !pedidas.has(u));
  if (!novas.length) return;
  for (const u of novas) pedidas.add(u);
  if (Platform.OS === 'web') {
    // No browser/Electron basta criar a imagem: o pedido entra na cache do
    // próprio browser, que é a mesma que a <img> do ecrã vai usar.
    for (const u of novas) {
      const img = new window.Image();
      img.decoding = 'async';
      img.src = u;
    }
    return;
  }
  // No iPhone as listas desenham com expo-image, e é a cache dele que conta.
  void Image.prefetch(novas as string[]).catch(() => {});
}

/** Esquece o que foi pedido -- ao sair da conta, as capas são de outra pessoa. */
export function esquecerCapasAquecidas(): void {
  pedidas.clear();
}

export function useAquecerCapas(userId: string | undefined): void {
  const offline = useConnectivity((s) => s.offline);

  // A Pesquisa. As prateleiras aterram uma a uma (ver o `prontas` da store),
  // por isso subscreve-se em vez de se ler uma vez: quem chega tarde também é
  // aquecida, e o `pedidas` garante que ninguém é pedida duas vezes.
  useEffect(() => {
    if (!userId || offline) return;
    const aquecer = () => {
      const r = useRecomendacoes.getState();
      pedir(imagensAAquecer([
        capasDeFaixas(r.descobrir),
        capasDeFaixas(r.flow),
        capasDeFaixas(r.maisTocadas),
        capasDeFaixas(r.ouvirDeNovo),
        capasDeFaixas(r.amigos),
        capasDeFaixas(r.nuncaLancado),
        capasDeFaixas(r.esquecidas),
        ...r.misturas.map((m) => capasDeFaixas(m.faixas)),
      ]));
    };
    aquecer();
    return useRecomendacoes.subscribe(aquecer);
  }, [userId, offline]);

  // O perfil. O `aquecerPerfilProprio` (App.tsx) enche a cache no arranque;
  // isto espera por ela sem a ir buscar outra vez.
  useEffect(() => {
    if (!userId || offline) return;
    let parado = false;
    const tentar = () => {
      if (parado) return true;
      const p = perfilEmCache(userId);
      if (!p) return false;
      const avatar = capaDoPerfil(p.perfil);
      pedir(imagensAAquecer([
        avatar ? [avatar] : [],
        capasDePlaylists(p.playlists),
        capasDeFaixas(p.most),
        capasDeFaixas(p.recent),
      ]));
      return true;
    };
    if (tentar()) return;
    // A cache do perfil é um Map sem subscrição: espreita-se de segundo a
    // segundo durante uns segundos, e desiste-se. Não vale mais do que isso.
    let tentativas = 0;
    const id = setInterval(() => {
      if (tentar() || ++tentativas >= 8) clearInterval(id);
    }, 1_000);
    return () => { parado = true; clearInterval(id); };
  }, [userId, offline]);
}
