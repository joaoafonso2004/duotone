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
    void canal.track(pendente).catch(() => { ultimo = ''; });
  };
  const ligar = () => {
    if (!vivo || canal || !presencaAoVivoDisponivel()) return;
    const novo = supabase.channel(topicoDaPresenca(userId), { config: { private: true, presence: { key: chave } } });
    canal = novo;
    novo.subscribe((estado) => {
      if (!vivo || canal !== novo) return;
      ligado = estado === 'SUBSCRIBED';
      if (ligado) { ultimo = ''; enviar(); return; }
      if (estado === 'CHANNEL_ERROR') {
        // Sem o SQL (ou recusado): a tabela faz o trabalho, e tenta-se depois.
        marcarSemAutorizacao();
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
    }).subscribe((estado) => {
      if (!vivo || canais.get(id) !== canal || estado !== 'CHANNEL_ERROR') return;
      // Uma recusa é do servidor inteiro (o SQL), não deste amigo: larga tudo.
      marcarSemAutorizacao();
      desligarTodos();
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
    parar() { vivo = false; desligarTodos(); },
    canaisLigados: () => canais.size,
  };
}
