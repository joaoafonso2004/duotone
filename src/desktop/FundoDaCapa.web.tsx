import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useCompasso } from '../hooks/useCompasso.web';
import { desfoqueLeve } from '../lib/capaGrande';
import { msDoCompasso } from '../lib/compasso';
import { styles } from './estilos.web';
import { marcar } from './ui.web';

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
 */
export function FundoDaCapa({ uri, onde = 'pagina', aApagar = false }: { uri: string | null; onde?: 'pagina' | 'janela';
  /** A sair do Now Playing (20/10): a cor apaga-se como acendeu, em vez de sumir. */
  aApagar?: boolean;
}) {
  const fonte = desfoqueLeve(uri, 64)?.uri ?? null;
  const bpm = useCompasso()?.bpm;
  const trocaMs = bpm ? msDoCompasso(bpm) : 700;
  const [camadas, setCamadas] = useState<string[]>(() => (fonte ? [fonte] : []));
  useEffect(() => {
    if (!fonte) { setCamadas([]); return; }
    setCamadas((c) => (c[c.length - 1] === fonte ? c : [...c.slice(-1), fonte]));
    const t = setTimeout(() => setCamadas((c) => c.slice(-1)), trocaMs + 200);
    return () => clearTimeout(t);
  }, [fonte]);
  return (
    <View pointerEvents="none" style={onde === 'janela' ? styles.janelaCor : styles.npFundo}
      {...(onde === 'janela' ? marcar('janela-cor', ...(aApagar ? ['a-apagar'] : [])) : {})}>
      {camadas.map((c, i) => (
        <View key={c} style={[styles.npFundoCapa, { backgroundImage: `url("${c}")` } as any]}
          {...(i === camadas.length - 1 && camadas.length > 1 ? marcar('np-fundo') : {})} />
      ))}
      <View style={onde === 'janela' ? styles.janelaCorVeu : styles.npFundoVeu} />
    </View>
  );
}
