import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { desfoqueLeve } from '../lib/capaGrande';
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
 * Ao mudar de faixa, a capa nova entra POR CIMA da anterior (`np-fundo`, 700
 * ms), e a de baixo só sai depois: nunca se vê o fundo vazio a meio.
 *
 * `onde`: `pagina` é o de sempre, dentro do Now Playing. `janela` (26/9, pedido
 * do João) é a mesma cor a encher a janela inteira -- lateral, barra de título
 * e leitor --, com um véu que também escurece a lateral para ela se ler.
 */
export function FundoDaCapa({ uri, onde = 'pagina' }: { uri: string | null; onde?: 'pagina' | 'janela' }) {
  const fonte = desfoqueLeve(uri, 64)?.uri ?? null;
  const [camadas, setCamadas] = useState<string[]>(() => (fonte ? [fonte] : []));
  useEffect(() => {
    if (!fonte) { setCamadas([]); return; }
    setCamadas((c) => (c[c.length - 1] === fonte ? c : [...c.slice(-1), fonte]));
    const t = setTimeout(() => setCamadas((c) => c.slice(-1)), 900);
    return () => clearTimeout(t);
  }, [fonte]);
  return (
    <View pointerEvents="none" style={onde === 'janela' ? styles.janelaCor : styles.npFundo}
      {...(onde === 'janela' ? marcar('janela-cor') : {})}>
      {camadas.map((c, i) => (
        <View key={c} style={[styles.npFundoCapa, { backgroundImage: `url("${c}")` } as any]}
          {...(i === camadas.length - 1 && camadas.length > 1 ? marcar('np-fundo') : {})} />
      ))}
      <View style={onde === 'janela' ? styles.janelaCorVeu : styles.npFundoVeu} />
    </View>
  );
}
