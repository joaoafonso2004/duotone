import { ESTILOS_DA_CAPA, lerAparencia, type Aparencia, type EstiloDaCapa } from './aparencia';
import { nomeDoPreset } from './presetsDaAparencia';

/**
 * Um preset da Customise mandado a um amigo pelo chat (28/11, o João: "quero que
 * dê para partilhar preset do customization com amigos pelo chat, e eles podem
 * guardar e usar"). É o tipo 'preset' da `shared_items`
 * (supabase/partilhar-presets.sql), com tudo no `track_data`:
 *
 *   { title: nome, kind: 'preset', v: 1, capa: 'floating', aparencia: {...} }
 *
 * O nome vai em `title` porque é essa a chave que a lista das conversas já lê.
 * Quem recebe valida o aspeto outra vez (`lerAparencia`): o que vem da rede é de
 * outra pessoa, e uma opção que não existe passa à de origem.
 *
 * Puro (só o lib/aparencia e o dos presets): `scripts/test-partilhar-presets.ts`.
 */
export type PresetPartilhado = { nome: string; aparencia: Aparencia; capa: EstiloDaCapa };

/** O limite do servidor (o `shared_preset_valid`): o jsonb inteiro. */
export const LIMITE_DO_PRESET = 6000;

const CAPAS = ESTILOS_DA_CAPA.map((e) => e.valor) as readonly string[];

/** O `track_data` de um preset, ou null se não se puder mandar (sem nome, grande de mais). */
export function presetParaPartilhar(p: { nome: string; aparencia: unknown; capa: unknown }): Record<string, unknown> | null {
  const nome = nomeDoPreset(String(p?.nome ?? ''));
  if (!nome) return null;
  const dados = {
    title: nome,
    kind: 'preset',
    v: 1,
    capa: typeof p.capa === 'string' && CAPAS.includes(p.capa) ? p.capa : 'floating',
    aparencia: lerAparencia(p.aparencia),
  };
  return JSON.stringify(dados).length <= LIMITE_DO_PRESET ? dados : null;
}

/** O preset que chegou, validado, ou null se o que veio não é um preset. */
export function presetPartilhado(dados: unknown): PresetPartilhado | null {
  if (!dados || typeof dados !== 'object') return null;
  const d = dados as Record<string, unknown>;
  if (d.kind !== 'preset' || !d.aparencia || typeof d.aparencia !== 'object') return null;
  const nome = nomeDoPreset(typeof d.title === 'string' ? d.title : '');
  if (!nome) return null;
  return {
    nome,
    aparencia: lerAparencia(d.aparencia),
    capa: typeof d.capa === 'string' && CAPAS.includes(d.capa) ? d.capa as EstiloDaCapa : 'floating',
  };
}

/**
 * O que o preset tem de diferente, numa linha ("Floating 3D · OLED · Serif ·
 * Liquid Glass"): o estilo da capa sempre, e as opções que mais se veem.
 */
export function legendaDoPreset(p: PresetPartilhado): string {
  const a = p.aparencia;
  const partes = [ESTILOS_DA_CAPA.find((e) => e.valor === p.capa)?.nome ?? 'Floating 3D'];
  if (a.fundoApp === 'oled') partes.push('OLED');
  if (a.titulos === 'serif') partes.push('Serif');
  if (a.titulos === 'mono') partes.push('Mono');
  if (a.listas === 'compact') partes.push('Compact');
  if (a.vidro) partes.push('Liquid Glass');
  if (a.fundoDaMusica) partes.push('Colour follows the song');
  return partes.join(' · ');
}

/**
 * Um nome que ainda não está nos presets de quem guarda: o mesmo, ou com " 2",
 * " 3"... (sem passar das 24 letras do nome de um preset).
 */
export function nomeLivre(nome: string, usados: readonly string[]): string {
  const base = nomeDoPreset(nome) || 'Preset';
  const tomados = new Set(usados.map((n) => n.toLowerCase()));
  if (!tomados.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const sufixo = ` ${n}`;
    const candidato = `${base.slice(0, 24 - sufixo.length).trimEnd()}${sufixo}`;
    if (!tomados.has(candidato.toLowerCase())) return candidato;
  }
}
