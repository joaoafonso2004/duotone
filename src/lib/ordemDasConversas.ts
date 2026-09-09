/**
 * Grupos e amigos numa lista só, por quem falou por último.
 *
 * ## Porque é uma lista e não duas
 *
 * Eram duas, com dois cabeçalhos e dois ritmos -- "GROUPS · 1" e "FRIENDS · 6"
 * -- e a pergunta que se faz a esta página não é "quais são os meus grupos",
 * é "com quem falo a seguir". Uma lista só, pela ordem em que as conversas
 * mexeram, é o que responde a isso. É também o que devolve duas bandas de
 * altura ao conteúdo.
 *
 * ## O degradar sem a migração
 *
 * A `conversation_activity` só conhecia conversas directas. A migração
 * `supabase/ordem-das-conversas-com-grupos.sql` acrescenta-lhe os grupos, mas
 * corre-se à mão -- e até lá **nenhum grupo tem data**.
 *
 * Sem cuidado, isso mandava os grupos para o fundo da lista, atrás de
 * conversas de há meses. Por isso: se NENHUM grupo tiver data, eles ficam à
 * cabeça, que é exactamente onde estavam antes. Basta UM grupo com data para
 * se assumir que a migração correu e passar a misturar tudo pela hora.
 *
 * Sem imports de runtime: `scripts/test-ordem-das-conversas.ts` corre em Node
 * puro, como o resto da lógica desta app.
 */

/** Uma entrada da lista, seja pessoa ou grupo. */
export type Conversa<G, A> =
  | { tipo: 'grupo'; id: string; nome: string; quando: number; grupo: G }
  | { tipo: 'amigo'; id: string; nome: string; quando: number; amigo: A };

/**
 * Junta e ordena.
 *
 * `quando` é a última mexida da conversa, em epoch ms, ou 0 para "nunca". Quem
 * nunca trocou nada fica por baixo e por NOME -- sem isso, a cauda da lista
 * parecia baralhada ao acaso a cada arranque, que é a mesma razão que já estava
 * escrita na ordenação antiga dos amigos.
 */
export function ordenarConversas<G, A>(
  grupos: readonly { id: string; nome: string; grupo: G }[],
  amigos: readonly { id: string; nome: string; amigo: A }[],
  actividade: Readonly<Record<string, number>>,
): Conversa<G, A>[] {
  const quando = (id: string) => actividade[id] ?? 0;
  // Um grupo com data significa que a migração correu. Sem nenhum, não se
  // pode concluir nada sobre eles -- e mandá-los para o fundo seria concluir.
  const grupoTemData = grupos.some((g) => quando(g.id) > 0);

  const dosGrupos: Conversa<G, A>[] = grupos.map((g) => ({
    tipo: 'grupo', id: g.id, nome: g.nome, quando: quando(g.id), grupo: g.grupo,
  }));
  const dosAmigos: Conversa<G, A>[] = amigos.map((a) => ({
    tipo: 'amigo', id: a.id, nome: a.nome, quando: quando(a.id), amigo: a.amigo,
  }));

  if (!grupoTemData) {
    return [...dosGrupos.sort(porNome), ...dosAmigos.sort(porHoraDepoisNome)];
  }
  return [...dosGrupos, ...dosAmigos].sort(porHoraDepoisNome);
}

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome);

/** Quem falou mais recentemente primeiro; quem nunca falou, por nome. */
const porHoraDepoisNome = (
  a: { quando: number; nome: string },
  b: { quando: number; nome: string },
) => (a.quando || b.quando ? b.quando - a.quando : a.nome.localeCompare(b.nome));

/**
 * Ao fim de quantas conversas é que a pesquisa vale a pena.
 *
 * Com meia dúzia, um campo de pesquisa é uma linha a ocupar espaço por cima
 * de uma lista que se vê inteira. A partir daqui é o que evita rolar.
 */
export const CONVERSAS_PARA_PESQUISAR = 12;
