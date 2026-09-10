/**
 * O que o Discord mostra no teu perfil enquanto ouves.
 *
 * ## O que isto é e o que não é
 *
 * Decide o CONTEÚDO da presença; não fala com ninguém. Quem fala com o Discord
 * é o processo principal do Electron, pelo `\\.\pipe\discord-ipc-0` -- o mesmo
 * padrão das outras pontes (`yt:pesquisa`, `catalogo:pedir`). Só Windows: no
 * iPhone não há socket local do Discord, e isso não é falta de esforço, é
 * impossível.
 *
 * ## Os limites são do Discord e são recusas, não avisos
 *
 * Um campo fora dos limites não é ignorado -- o Discord recusa a presença
 * inteira e não aparece nada. Por isso tudo é cortado aqui:
 *
 *  - `details` e `state`: 128 caracteres, e no MÍNIMO dois. Uma faixa chamada
 *    "7" deitaria a presença toda abaixo.
 *  - `large_image`: 300 caracteres. Um URL de miniatura do YouTube tem uns
 *    cinquenta, mas quem vier de outra fonte pode não ter.
 *  - botões: dois, com etiqueta até 32.
 *
 * Sem imports de runtime: `scripts/test-presenca-discord.ts` corre em Node
 * puro, como o resto da lógica desta app.
 */

import type { Track } from '../types';

/** A actividade tal como o Discord a quer. */
export type ActividadeDoDiscord = {
  /** 2 = "A ouvir"; 0 = actividade jogável, exigida pelos convites nativos. */
  type: 0 | 2;
  details: string;
  state?: string;
  assets?: { large_image?: string; large_text?: string };
  timestamps?: { start?: number; end?: number };
  party?: { id: string; size: [number, number] };
  secrets?: { join: string };
  instance?: boolean;
  buttons?: { label: string; url: string }[];
};

const MAX_TEXTO = 128;
const MIN_TEXTO = 2;
const MAX_IMAGEM = 300;
const MAX_ETIQUETA = 32;
const PREFIXO_JAM = 'duotone-jam:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * O segredo que o Discord entrega a quem carrega em "Juntar-se".
 *
 * Não leva informação do utilizador nem da faixa: é apenas a chave da sala.
 * A RPC `entrar_na_sessao` volta a confirmar no servidor que quem chegou é
 * amigo do anfitrião, portanto conhecer este valor não contorna a privacidade
 * do Jam.
 */
export function segredoDiscordDaSessao(sessao: string): string | null {
  const id = sessao.trim();
  return UUID.test(id) ? `${PREFIXO_JAM}${id.toLowerCase()}` : null;
}

/** Aceita apenas segredos desta versão da Duotone; lixo nunca chega à API. */
export function sessaoDoSegredoDiscord(segredo: string): string | null {
  if (!segredo.startsWith(PREFIXO_JAM)) return null;
  const id = segredo.slice(PREFIXO_JAM.length);
  return UUID.test(id) ? id.toLowerCase() : null;
}

/** Corta ao limite e devolve vazio se não sobrar o mínimo que o Discord exige. */
function texto(valor: string | null | undefined): string {
  const limpo = (valor ?? '').trim().slice(0, MAX_TEXTO);
  return limpo.length >= MIN_TEXTO ? limpo : '';
}

/**
 * A presença desta faixa, ou `null` se não houver nada para mostrar.
 *
 * `null` é uma resposta a sério: quem chama tem de LIMPAR a presença, e não
 * deixar lá a faixa anterior. Uma presença que fica colada depois de a música
 * parar é pior do que nenhuma -- diz aos teus amigos que estás a ouvir uma
 * coisa que acabou há uma hora.
 */
export function presencaDaFaixa(
  faixa: Track | null,
  estado: {
    aTocar: boolean;
    posicaoMs: number;
    duracaoMs: number | null;
    /** Epoch ms. Entra por fora para o teste não depender do relógio. */
    agora: number;
  },
  titulo: (t: Track) => string,
  artista: (t: Track) => string,
  jam?: {
    sessao: string;
    membros: number;
  } | null,
): ActividadeDoDiscord | null {
  if (!faixa) return null;

  const nome = texto(titulo(faixa));
  // Sem título não há presença: o `details` é o único campo obrigatório, e
  // inventar-lhe um valor seria mostrar "Unknown" a toda a gente.
  if (!nome) return null;

  const quem = artista(faixa);
  const segredo = jam ? segredoDiscordDaSessao(jam.sessao) : null;
  // O Discord só expõe convites/join para actividades jogáveis. Fora de um
  // Jam mantemos o cabeçalho correcto, "A ouvir Duotone"; dentro dele usamos
  // Playing para ganhar o botão nativo que entrega o segredo da sala.
  const actividade: ActividadeDoDiscord = { type: segredo ? 0 : 2, details: nome };

  // "Unknown artist" é o que o `displayArtist` devolve quando desiste. Mostrar
  // isso a um amigo não acrescenta nada.
  const linhaDoArtista = quem && quem.toLowerCase() !== 'unknown artist' ? texto(quem) : '';
  if (linhaDoArtista) actividade.state = linhaDoArtista;

  const capa = faixa.artworkUrl ?? '';
  if (/^https:\/\//.test(capa) && capa.length <= MAX_IMAGEM) {
    actividade.assets = { large_image: capa };
    // O `large_text` é o que aparece ao passar o rato pela capa.
    const album = texto(faixa.album) || nome;
    if (album) actividade.assets.large_text = album;
  }

  /**
   * A barra de progresso, e só a tocar.
   *
   * O Discord desenha-a sozinho a partir do início e do fim -- não há como lhe
   * dizer "está em pausa". Deixar os tempos com a música parada punha a barra
   * a andar sozinha e a acabar sem nada tocar, que é mentira a andar no perfil
   * de alguém. Em pausa fica o cartão sem barra, que é verdade.
   */
  if (estado.aTocar && estado.duracaoMs && estado.duracaoMs > 0) {
    const posicao = Math.max(0, Math.min(estado.posicaoMs, estado.duracaoMs));
    // A store e o JavaScript medem tempo em milissegundos, mas o RPC do
    // Discord recebe Unix time em SEGUNDOS. Enviar Date.now() diretamente
    // produz uma data dezenas de milhares de anos no futuro; o socket abre,
    // mas o Discord recusa a atividade completa sem a mostrar no perfil.
    const inicio = Math.floor((estado.agora - posicao) / 1000);
    const fim = Math.ceil((estado.agora - posicao + estado.duracaoMs) / 1000);
    actividade.timestamps = { start: inicio, end: fim };
  }

  if (segredo && jam) {
    const presentes = Math.max(1, Math.floor(jam.membros));
    // O Jam não tem lotação rígida. O Discord, porém, precisa de um máximo
    // maior do que o tamanho actual para manter "Juntar-se" disponível.
    const capacidade = Math.max(8, presentes + 1);
    actividade.party = { id: jam.sessao.toLowerCase(), size: [presentes, capacidade] };
    actividade.secrets = { join: segredo };
    actividade.instance = true;
  }

  // Num Jam, o botão do YouTube sai. O Discord recusa segredo e botões juntos
  // -- `5005 "secrets cannot currently be sent with buttons"`, confirmado ao
  // vivo contra o cliente a 10/9/2026 -- e a recusa é da actividade INTEIRA:
  // o perfil ficava vazio e sem "Juntar-se", justamente durante o Jam.
  if (!segredo && faixa.source === 'youtube' && faixa.sourceId) {
    actividade.buttons = [{
      label: 'Listen on YouTube'.slice(0, MAX_ETIQUETA),
      url: `https://www.youtube.com/watch?v=${faixa.sourceId}`,
    }];
  }

  return actividade;
}

/**
 * Mudou alguma coisa que valha um envio?
 *
 * O Discord aceita um `SET_ACTIVITY` a cada 15 segundos por aplicação; enviar
 * a cada tique da barra de progresso seria estrangulado e, pior, sem efeito.
 * A posição de propósito NÃO entra na comparação: a barra anda sozinha do lado
 * do Discord a partir dos tempos, e reenviar por causa dela era reenviar
 * sempre.
 */
export function presencaMudou(
  antes: ActividadeDoDiscord | null,
  depois: ActividadeDoDiscord | null,
): boolean {
  if (!antes || !depois) return antes !== depois;
  // O Jam conta como mudança: abrir um a meio da faixa tem de publicar o
  // segredo JÁ, e não quando a música acabar. Sem isto, o "Juntar-se" levava
  // uma faixa inteira a aparecer, e ficava no perfil depois de o Jam fechar.
  if (antes.type !== depois.type
    || antes.secrets?.join !== depois.secrets?.join
    || antes.party?.size[0] !== depois.party?.size[0]) return true;
  return antes.details !== depois.details
    || antes.state !== depois.state
    || antes.assets?.large_image !== depois.assets?.large_image
    // Só o FIM: o início desliza a cada procura na barra, e o fim só muda
    // quando muda a faixa ou se salta de sítio a sério.
    || antes.timestamps?.end !== depois.timestamps?.end
    || (!!antes.timestamps) !== (!!depois.timestamps);
}
