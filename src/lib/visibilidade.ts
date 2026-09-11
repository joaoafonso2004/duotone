/**
 * Quem vê o que está a tocar -- a regra do indicador no leitor.
 *
 * Havia três sítios a publicar o que se ouve (a presença para os amigos, o
 * Discord no PC, e o Jam para quem lá está dentro) e nenhum sítio a dizê-lo à
 * própria pessoa. Isto junta os três numa resposta só, e diz também o que um
 * clique no indicador faz.
 *
 * ## A ordem
 *
 * O Jam ganha a tudo: quem está lá dentro ouve o mesmo, e qualquer amigo pode
 * entrar sem convite (`entrar_na_sessao`) -- a escuta privada não fecha essa
 * porta, por isso o indicador não pode dizer "Private" dentro de um Jam. A
 * seguir a privada, que desliga as outras duas. Só depois o Discord, que é os
 * amigos MAIS o perfil do Discord.
 *
 * ## O que a privada NÃO esconde
 *
 * O histórico de reproduções continua a contar -- é dele que saem as
 * recomendações e as estatísticas, e os amigos veem-no no perfil. O que sai é o
 * "a ouvir agora". Os textos daqui dizem exatamente isso e nada mais.
 */

export type Visibilidade = 'jam' | 'privada' | 'discord' | 'amigos';

export interface EntradaDaVisibilidade {
  /** Há um Jam aberto e esta pessoa está lá dentro. */
  emJam: boolean;
  /** Quantas pessoas estão no Jam agora, contando com esta. */
  pessoasNoJam: number;
  /** A escuta privada está ligada neste aparelho. */
  privada: boolean;
  /** O Discord está a publicar -- só no PC, e só com a preferência ligada. */
  discord: boolean;
}

export interface EstadoDaVisibilidade {
  estado: Visibilidade;
  /** Curto: cabe por baixo de um ícone no iPhone. O PC não o mostra -- lá é só um olho. */
  rotulo: string;
  /** A frase inteira, para quem lê com o VoiceOver e para o tooltip. */
  descricao: string;
  /** O que um clique faz, dito como o VoiceOver o diz. */
  dica: string;
  /**
   * Nomes do Ionicons, para o iPhone. O PC desenha o próprio olho a partir do
   * `estado`: fechado na privada, aberto no resto.
   */
  icone: 'headset' | 'eye-off-outline' | 'logo-discord' | 'eye-outline';
  acao: 'abrirJam' | 'alternarPrivada';
}

export function visibilidade(e: EntradaDaVisibilidade): EstadoDaVisibilidade {
  if (e.emJam) {
    // Sozinho num Jam ainda é um Jam aberto: um amigo pode entrar a qualquer
    // momento. Um número 1 ao lado do nome lia-se como um erro.
    const outros = Math.max(0, Math.round(e.pessoasNoJam) - 1);
    return {
      estado: 'jam',
      rotulo: outros ? `Jam · ${outros + 1}` : 'Jam',
      descricao: outros
        ? `In a Jam with ${outros} ${outros === 1 ? 'other person' : 'others'}. Friends can join.`
        : 'Your Jam is open. Friends can join and hear what’s playing.',
      dica: 'Opens the Jam',
      icone: 'headset',
      acao: 'abrirJam',
    };
  }
  if (e.privada) {
    return {
      estado: 'privada',
      rotulo: 'Private',
      descricao: e.discord
        ? 'Private listening. Friends and Discord don’t see what’s playing.'
        : 'Private listening. Friends don’t see what’s playing.',
      dica: 'Turns private listening off',
      icone: 'eye-off-outline',
      acao: 'alternarPrivada',
    };
  }
  if (e.discord) {
    return {
      estado: 'discord',
      rotulo: 'Discord',
      descricao: 'Friends and Discord can see what’s playing.',
      dica: 'Turns private listening on',
      icone: 'logo-discord',
      acao: 'alternarPrivada',
    };
  }
  return {
    estado: 'amigos',
    rotulo: 'Friends',
    descricao: 'Friends can see what’s playing.',
    dica: 'Turns private listening on',
    icone: 'eye-outline',
    acao: 'alternarPrivada',
  };
}

/**
 * A frase curta que confirma a troca. Diz o que mudou para quem vê, e não
 * o nome do modo -- "Private" sozinho não explica que o Discord também saiu.
 */
export function avisoDaTroca(privadaAgora: boolean, discord: boolean): string {
  if (privadaAgora) return discord ? 'Hidden from friends and Discord' : 'Hidden from friends';
  return discord ? 'Friends and Discord can see what’s playing' : 'Friends can see what’s playing';
}
