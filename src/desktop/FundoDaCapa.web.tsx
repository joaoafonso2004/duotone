import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useCompasso } from '../hooks/useCompasso.web';
import { desfoqueLeve } from '../lib/capaGrande';
import { msDoCompasso } from '../lib/compasso';
import { styles } from './estilos.web';
import { marcar } from './ui.web';
import { useAtrasadoPelaOcultacao } from './Ocultacao.web';

/**
 * O fundo do leitor do iPhone, no PC: a PRÓPRIA capa muito desfocada e
 * escurecida, com um véu por cima (mais forte do lado da fila e em baixo, para
 * tudo se ler com uma capa clara). Escolhido pelo João a 25/9 depois de ver uma
 * cor lisa e uma mancha à volta da capa ("uma cor estática").
 *
 * **Parte da miniatura pequena** (`desfoqueLeve`, a mesma do iPhone): desfocar
 * a capa grande era trabalho à toa. E é um `filter` numa IMAGEM parada, não um
 * `backdrop-filter` -- esse refaz-se a cada pintura e foi o que deixou a 3.7.1
 * pesada (ver o CLAUDE.md, "O movimento do PC").
 *
 * Ao mudar de faixa, a capa nova entra POR CIMA da anterior (`np-fundo`), e a de
 * baixo só sai depois: nunca se vê o fundo vazio a meio. Dura um compasso da música
 * que chega quando ela já foi medida (S3, `lib/compasso.ts`), e 700 ms quando não.
 *
 * `onde`: `pagina` é o de sempre, dentro do Now Playing. `janela` (26/9, pedido
 * do João) é a mesma cor a encher a janela inteira -- lateral, barra de título
 * e leitor --, com um véu que também escurece a lateral para ela se ler.
 *
 * `foto` (5/11) troca a capa desfocada pela foto do artista, nítida, e `cinema`
 * troca o véu pelo do layout Cinema. As duas opções vivem em Appearance.
 */
export function FundoDaCapa({ uri, onde = 'pagina', aApagar = false, foto = null, cinema = false }: { uri: string | null; onde?: 'pagina' | 'janela';
  /** A sair do Now Playing (20/10): a cor apaga-se como acendeu, em vez de sumir. */
  aApagar?: boolean;
  /**
   * A foto do artista (5/11, "Now Playing background: Artist photo"), já no
   * tamanho: NÍTIDA, em vez da capa desfocada. Sem ela (`null`), a capa.
   */
  foto?: string | null;
  /** O véu do layout Cinema (5/11): escuro à esquerda, onde vive o título enorme. */
  cinema?: boolean;
}) {
  // Troca quando a capa troca (7/11): com a Ocultação, só quando o disco a tapa.
  // Antes trocava no instante do skip, com a capa da música anterior ainda à frente.
  // A chave leva o tipo da camada (n: a foto nítida, d: a capa desfocada).
  const agora = foto ? `n:${foto}` : (() => { const d = desfoqueLeve(uri, 64)?.uri; return d ? `d:${d}` : null; })();
  const chave = useAtrasadoPelaOcultacao(agora);
  const fonte = chave ? chave.slice(2) : null;
  const nitida = !!chave && chave.startsWith('n:');
  const bpm = useCompasso()?.bpm;
  const trocaMs = bpm ? msDoCompasso(bpm) : 700;
  // Cada camada lembra-se do que é: a capa que sai não fica nítida a meio da
  // troca para a foto, nem a foto desfocada ao voltar à capa.
  const [camadas, setCamadas] = useState<{ src: string; nitida: boolean }[]>(() => (fonte ? [{ src: fonte, nitida }] : []));
  useEffect(() => {
    if (!fonte) { setCamadas([]); return; }
    setCamadas((c) => (c[c.length - 1]?.src === fonte ? c : [...c.slice(-1), { src: fonte, nitida }]));
    const t = setTimeout(() => setCamadas((c) => c.slice(-1)), trocaMs + 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o `nitida` vem com a fonte
  }, [fonte]);
  const veu = cinema ? styles.cinemaVeu : onde === 'janela' ? styles.janelaCorVeu : styles.npFundoVeu;
  return (
    <View pointerEvents="none" style={onde === 'janela' ? styles.janelaCor : styles.npFundo}
      {...(onde === 'janela' ? marcar('janela-cor', ...(aApagar ? ['a-apagar'] : [])) : {})}>
      {camadas.map((c, i) => (
        // A posição com dois valores vai aqui: o StyleSheet.create do RNW recusa-a e, em dev, deita-a fora.
        <View key={c.src} style={[c.nitida ? styles.npFundoFoto : styles.npFundoCapa, { backgroundImage: `url("${c.src}")`, ...(c.nitida ? { backgroundPosition: '62% 30%' } : null) } as any]}
          {...(i === camadas.length - 1 && camadas.length > 1 ? marcar('np-fundo') : {})} />
      ))}
      <View style={veu} />
    </View>
  );
}
