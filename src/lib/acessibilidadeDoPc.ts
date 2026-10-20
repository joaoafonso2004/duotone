/**
 * O teclado e as legendas do PC (20/10, revisão de qualidade, Q3 a Q5 em
 * docs/REVISAO-DE-QUALIDADE.md). As decisões vivem aqui; quem ouve o DOM
 * (`Dialog` e `useDicas`, em desktop/) só as executa.
 *
 * Puro e sem imports: `scripts/test-acessibilidade-do-pc.ts`.
 */

// ------------------------------------------------------- camadas (diálogos) --

/**
 * Quem está por cima. Cada `Dialog` ouvia o Escape da janela inteira: com dois
 * abertos (o "Add to playlist" por cima da pré-visualização de um álbum), um
 * Escape fechava os dois. Agora só a camada de cima responde ao Escape e ao
 * Tab; as de baixo esperam a vez.
 */
export function criarPilhaDeCamadas() {
  let proxima = 1;
  const abertas: number[] = [];
  return {
    abrir(): number {
      const id = proxima++;
      abertas.push(id);
      return id;
    },
    fechar(id: number): void {
      const i = abertas.indexOf(id);
      if (i >= 0) abertas.splice(i, 1);
    },
    noTopo(id: number): boolean {
      return abertas.length > 0 && abertas[abertas.length - 1] === id;
    },
    get quantas(): number { return abertas.length; },
  };
}

/**
 * Para onde vai o foco com o Tab dentro de um diálogo, ou `null` para deixar o
 * browser andar sozinho. Só se intervém nas pontas (dar a volta) e quando o
 * foco está fora do diálogo (`indice` -1): é o que o prende lá dentro.
 */
export function focoAoTab(indice: number, total: number, recuar: boolean): number | null {
  if (total <= 0) return null;
  if (indice < 0) return recuar ? total - 1 : 0;
  if (recuar && indice === 0) return total - 1;
  if (!recuar && indice === total - 1) return 0;
  return null;
}

// ------------------------------------------------------------- os sliders --

/**
 * O que uma tecla vale num slider do PC, em "dentes" da roda do rato
 * (`lib/rodaDoRato.ts`: 5 de volume, ou 5 s de música, por dente). A barra da
 * velocidade e as do EQ já andavam com as setas; o volume e a barra de
 * progresso não andavam com tecla nenhuma.
 *
 * Seta: um dente. Shift+seta: dois (10 s, o mesmo salto do atalho da janela).
 * Page Up/Down: seis (30 s, ou 30 de volume). Home e End: as pontas.
 * `null` é uma tecla que não é do slider (o Espaço continua a pausar).
 */
export function dentesDaTecla(key: string, shift: boolean): number | 'inicio' | 'fim' | null {
  switch (key) {
    case 'ArrowRight': case 'ArrowUp': return shift ? 2 : 1;
    case 'ArrowLeft': case 'ArrowDown': return shift ? -2 : -1;
    case 'PageUp': return 6;
    case 'PageDown': return -6;
    case 'Home': return 'inicio';
    case 'End': return 'fim';
    default: return null;
  }
}

/** O que o leitor de ecrã diz da barra de progresso: "1:23 of 3:45". */
export function valorDaProcura(posicaoS: number, duracaoS: number): string {
  const t = (s: number) => {
    const v = Math.max(0, Math.floor(s));
    return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  };
  return `${t(posicaoS)} of ${t(duracaoS)}`;
}

// ------------------------------------------------------------- as legendas --

/**
 * O texto da legenda de um botão de ícone: o mesmo nome que o leitor de ecrã
 * já lia (`accessibilityLabel`), e o atalho quando há.
 */
export function textoDaDica(rotulo: string, atalho?: string): { rotulo: string; atalho: string | null } {
  return { rotulo: rotulo.trim(), atalho: atalho?.trim() || null };
}

type Caixa = { x: number; y: number; largura: number; altura: number };

/** Quanto a legenda fica afastada do botão e das bordas da janela. */
export const DISTANCIA_DA_DICA = 6;
export const MARGEM_DA_DICA = 8;

/**
 * Onde a legenda se desenha: por cima do botão, ao centro, e por baixo quando
 * não cabe em cima (a barra do título). Nunca sai da janela pelos lados.
 */
export function posicaoDaDica(
  botao: Caixa,
  dica: { largura: number; altura: number },
  janela: { largura: number; altura: number },
): { x: number; y: number; lado: 'cima' | 'baixo' } {
  const emCima = botao.y - DISTANCIA_DA_DICA - dica.altura;
  const lado = emCima >= MARGEM_DA_DICA ? 'cima' : 'baixo';
  const y = lado === 'cima' ? emCima : botao.y + botao.altura + DISTANCIA_DA_DICA;
  const centro = botao.x + botao.largura / 2 - dica.largura / 2;
  const maximo = Math.max(MARGEM_DA_DICA, janela.largura - dica.largura - MARGEM_DA_DICA);
  const x = Math.min(maximo, Math.max(MARGEM_DA_DICA, centro));
  return { x: Math.round(x), y: Math.round(y), lado };
}

/** O tempo com o rato parado em cima antes de a legenda aparecer. Com o foco
 * do teclado aparece logo: quem anda com o Tab precisa dela já. */
export const ESPERA_DA_DICA_MS = 450;
