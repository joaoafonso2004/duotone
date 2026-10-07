import { supabase } from '../lib/supabase';

/**
 * O painel de saúde (7/10, supabase/painel-de-saude.sql): o `app_events`
 * agregado, só para quem gere a app (a conta do João). Sem a migração, ou
 * noutra conta, `souAdministrador` diz que não e a entrada não aparece.
 */

export type PainelDeSaude = {
  dias: number;
  pessoas: number;
  eventos: number;
  porDia: { dia: string; pessoas: number }[];
  versoes: { plataforma: string; versao: string; pessoas: number; crashes: number; erros: number; bloqueios: number; falhas: number }[];
  falhas: { tipo: string; n: number }[];
  som: { origem: string; n: number; mediana: number; p90: number }[];
  erros: { nome: string; tipo: string; mensagem: string; n: number; pessoas: number; versao: string | null }[];
  aparelhos: { nome: string; plataforma: string; versao: string | null; ultimo: string; crashes: number; falhas: number; cpuAtras: number | null }[];
};

const n = (v: unknown) => { const x = typeof v === 'string' ? Number(v) : v; return typeof x === 'number' && Number.isFinite(x) ? x : 0; };
const t = (v: unknown) => (typeof v === 'string' ? v : '');
const lista = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** Lê a resposta do servidor sem confiar na forma: um campo em falta fica a zero. */
export function lerPainel(d: any): PainelDeSaude {
  return {
    dias: n(d?.dias), pessoas: n(d?.pessoas), eventos: n(d?.eventos),
    porDia: lista(d?.porDia).map((x) => ({ dia: t(x?.dia), pessoas: n(x?.pessoas) })),
    versoes: lista(d?.versoes).map((x) => ({ plataforma: t(x?.plataforma), versao: t(x?.versao), pessoas: n(x?.pessoas),
      crashes: n(x?.crashes), erros: n(x?.erros), bloqueios: n(x?.bloqueios), falhas: n(x?.falhas) })),
    falhas: lista(d?.falhas).map((x) => ({ tipo: t(x?.tipo), n: n(x?.n) })),
    som: lista(d?.som).map((x) => ({ origem: t(x?.origem), n: n(x?.n), mediana: n(x?.mediana), p90: n(x?.p90) })),
    erros: lista(d?.erros).map((x) => ({ nome: t(x?.nome), tipo: t(x?.tipo), mensagem: t(x?.mensagem), n: n(x?.n), pessoas: n(x?.pessoas), versao: t(x?.versao) || null })),
    aparelhos: lista(d?.aparelhos).map((x) => ({ nome: t(x?.nome), plataforma: t(x?.plataforma), versao: t(x?.versao) || null,
      ultimo: t(x?.ultimo), crashes: n(x?.crashes), falhas: n(x?.falhas), cpuAtras: x?.cpuAtras == null ? null : n(x.cpuAtras) })),
  };
}

let administrador: { conta: string; resposta: Promise<boolean> } | null = null;

/** Esta conta vê o painel? Pergunta-se uma vez por conta. Sem a migração, não. */
export function souAdministrador(conta: string | null | undefined): Promise<boolean> {
  if (!conta) return Promise.resolve(false);
  if (administrador?.conta !== conta) {
    administrador = {
      conta,
      resposta: Promise.resolve(supabase.rpc('e_administrador')).then(({ data, error }) => !error && data === true).catch(() => false),
    };
  }
  return administrador.resposta;
}

export async function lerPainelDeSaude(dias: number): Promise<PainelDeSaude> {
  const { data, error } = await supabase.rpc('painel_de_saude', { p_dias: dias });
  if (error) throw error;
  return lerPainel(data);
}
