import { supabase } from './supabase';
import { juntarAparelhos, topicoDaPresenca, type EstadoAoVivo } from './estadoDaPresencaAoVivo';

export { estadoParaDeclarar, presencaDoEstado, type EstadoAoVivo } from './estadoDaPresencaAoVivo';

/**
 * A presença dos amigos pelo Realtime Presence (11/11, pedido do João: "uma
 * presença que não gaste quase nada de base de dados").
 *
 * Cada "estou a ouvir X" era um `publish_social_presence`: um pedido à API e
 * uma linha nos logs do plano grátis. Agora cada pessoa declara o seu estado no
 * canal privado `presenca:<id>` (`track`), que vive na memória do Realtime e
 * desaparece sozinho quando a ligação cai -- o "Online" deixa de precisar de
 * batimentos. Os amigos entram nos canais dos amigos enquanto a app está à
 * frente. A tabela continua a ser escrita, mas só à entrada, à saída, de 10 em
 * 10 min e quando se fica ou deixa de estar online (`presenceSync.ts`): é ela
 * que dá o "visto há X" e a música a quem abre a app depois, e às versões
 * antigas.
 *
 * Quem pode o quê está em `supabase/presenca-ao-vivo.sql` (o mesmo
 * `social_can_view` da escuta ao vivo). Sem esse SQL, ou sem ligação, entrar no
 * canal falha: espera-se meia hora antes de tentar outra vez, e tudo funciona
 * como antes, pela tabela.
 *
 * Custo: as mensagens do Realtime (2 milhões/mês no plano grátis). Cada
 * declaração chega a cada amigo que está a ver; entrar num canal é uma
 * mensagem. Nenhum pedido à API, nenhuma linha de log por mudança.
 */

/** Mais amigos do que isto ficam pela tabela (os primeiros da lista). */
export const MAXIMO_DE_CANAIS_DE_AMIGOS = 40;
/** Depois de uma recusa (sem o SQL), quanto se espera antes de tentar outra vez. */
const ESPERA_SEM_AUTORIZACAO_MS = 30 * 60_000;
let semAutorizacaoAte = 0;

/** O canal pode ser usado agora? (Falso durante a meia hora depois de uma recusa.) */
export function presencaAoVivoDisponivel(agora = Date.now()): boolean {
  return agora >= semAutorizacaoAte;
}
function marcarSemAutorizacao(): void {
  semAutorizacaoAte = Date.now() + ESPERA_SEM_AUTORIZACAO_MS;
}
/** Um canal que o servidor fechou volta a entrar ao fim disto. */
const RELIGAR_DEPOIS_DE_FECHADO_MS = 60_000;

/**
 * Uma recusa do servidor, ou só a ligação que caiu? (26/11) O realtime-js chama
 * CHANNEL_ERROR às duas. A ligação que cai (o PC a dormir, a rede, um batimento
 * sem resposta) chega a TODOS os canais, e cada um volta a entrar sozinho
 * quando ela volta (o rejoin do phoenix). Tratada como recusa, largava os canais
 * dos amigos e esperava meia hora; o PC, que não tem o regresso à app, só
 * voltava a entrar ao reler os amigos, e via a música nova de um amigo só
 * quando ele escrevia a tabela (de 10 em 10 min). O João: "ele já está a ouvir
 * outra música há bué mas eu ainda não vejo". A recusa vem na resposta do
 * servidor, um objeto simples; as da ligação são um CloseEvent, um Event, um
 * Error ou nada (`normalizeChannelError` do realtime-js).
 */
export function eRecusaDoServidor(erro: unknown): boolean {
  const causa = (erro as { cause?: unknown } | null | undefined)?.cause;
  return !!causa && typeof causa === 'object' && Object.getPrototypeOf(causa) === Object.prototype
    && typeof (causa as { code?: unknown }).code !== 'number';
}

type Canal = ReturnType<typeof supabase.channel>;

/**
 * Quem publica: declara o estado de UM aparelho (`chave`) no seu canal. O
 * `declarar` não espera; o `aoVivo` diz se o canal está ligado (sem ele, quem
 * chama escreve na tabela, como antes).
 */
export function declararPresencaAoVivo(userId: string, chave: string) {
  let vivo = true;
  let ligado = false;
  let canal: Canal | null = null;
  let pendente: EstadoAoVivo | null = null;
  let ultimo = '';

  const enviar = () => {
    if (!vivo || !ligado || !canal || !pendente) return;
    const texto = JSON.stringify(pendente);
    if (texto === ultimo) return;
    ultimo = texto;
    // O `track` não rejeita: diz 'ok', 'error' ou 'timed out'.
    void canal.track(pendente).then((r) => { if (r !== 'ok') ultimo = ''; }, () => { ultimo = ''; });
  };
  const ligar = () => {
    if (!vivo || canal || !presencaAoVivoDisponivel()) return;
    const novo = supabase.channel(topicoDaPresenca(userId), { config: { private: true, presence: { key: chave } } });
    canal = novo;
    novo.subscribe((estado, erro) => {
      if (!vivo || canal !== novo) return;
      // Fora do canal (a ligação caiu), `aoVivo` é falso e quem chama escreve
      // na tabela; ao voltar a entrar, o estado declara-se outra vez.
      ligado = estado === 'SUBSCRIBED';
      if (ligado) { ultimo = ''; enviar(); return; }
      const recusa = estado === 'CHANNEL_ERROR' && eRecusaDoServidor(erro);
      if (recusa || estado === 'CLOSED') {
        // Sem o SQL (ou recusado): a tabela faz o trabalho, e tenta-se depois.
        // Fechado pelo servidor: o próximo `declarar` abre outro.
        if (recusa) marcarSemAutorizacao();
        canal = null;
        void supabase.removeChannel(novo).catch(() => {});
      }
    });
  };
  ligar();

  return {
    declarar(estado: EstadoAoVivo) {
      pendente = estado;
      if (!canal) ligar();
      enviar();
    },
    aoVivo: () => vivo && ligado && !!canal,
    async parar() {
      vivo = false;
      ligado = false;
      const c = canal;
      canal = null;
      if (!c) return;
      await c.untrack().catch(() => {});
      await supabase.removeChannel(c).catch(() => {});
    },
  };
}

/**
 * Quem lê: entra nos canais dos amigos e chama `receber` a cada mudança.
 * `null` é "saiu" -- só para quem esteve no canal desde que se entrou (um amigo
 * numa versão antiga nunca lá aparece, e esse fica pela tabela).
 */
export function ouvirPresencasAoVivo(receber: (userId: string, estado: EstadoAoVivo | null) => void) {
  const canais = new Map<string, Canal>();
  const vistos = new Set<string>();
  let ids: string[] = [];
  let pausado = false;
  let vivo = true;
  // Voltar a entrar sem esperar por quem chama (26/11): o PC não tem o regresso
  // à app, e o `atualizar` só vem quando se releem os amigos.
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const aplicarDaquiA = (ms: number) => {
    clearTimeout(relogio);
    relogio = setTimeout(() => { relogio = undefined; aplicar(); }, ms);
  };

  const desligar = (id: string) => {
    const c = canais.get(id);
    if (!c) return;
    canais.delete(id);
    void supabase.removeChannel(c).catch(() => {});
  };
  const desligarTodos = () => { for (const id of [...canais.keys()]) desligar(id); };
  const ligar = (id: string) => {
    const canal = supabase.channel(topicoDaPresenca(id), { config: { private: true, presence: { enabled: true } } });
    canais.set(id, canal);
    canal.on('presence', { event: 'sync' }, () => {
      if (!vivo || canais.get(id) !== canal) return;
      const estado = juntarAparelhos(Object.values(canal.presenceState()).flat());
      if (estado) { vistos.add(id); receber(id, estado); }
      else if (vistos.has(id)) receber(id, null);
    }).subscribe((estado, erro) => {
      if (!vivo || canais.get(id) !== canal) return;
      if (estado === 'CLOSED') {
        // Fechado pelo servidor: o realtime-js não volta a entrar num canal fechado.
        canais.delete(id);
        aplicarDaquiA(RELIGAR_DEPOIS_DE_FECHADO_MS);
        return;
      }
      // A ligação que caiu não é uma recusa: o canal volta a entrar sozinho.
      if (estado !== 'CHANNEL_ERROR' || !eRecusaDoServidor(erro)) return;
      // Uma recusa é do servidor inteiro (o SQL), não deste amigo: larga tudo,
      // e volta a tentar quando acaba a espera.
      marcarSemAutorizacao();
      desligarTodos();
      aplicarDaquiA(ESPERA_SEM_AUTORIZACAO_MS + 1000);
    });
  };
  const aplicar = () => {
    if (!vivo) return;
    const querer = pausado || !presencaAoVivoDisponivel() ? [] : ids.slice(0, MAXIMO_DE_CANAIS_DE_AMIGOS);
    for (const id of [...canais.keys()]) if (!querer.includes(id)) desligar(id);
    for (const id of querer) if (!canais.has(id)) ligar(id);
  };

  return {
    /** Os amigos aceites, pela ordem da lista. */
    atualizar(novos: readonly string[]) {
      ids = [...new Set(novos)];
      aplicar();
    },
    /** O iPhone em segundo plano sem ninguém a seguir: larga os canais. */
    pausar() { pausado = true; aplicar(); },
    retomar() { pausado = false; aplicar(); },
    parar() { vivo = false; clearTimeout(relogio); desligarTodos(); },
    canaisLigados: () => canais.size,
  };
}
