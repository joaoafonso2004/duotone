import { ESTILOS_DA_CAPA, lerAparencia, type Aparencia, type EstiloDaCapa } from './aparencia';

/**
 * Os presets do Customise (26/11, o João: "não tem como guardar preset de
 * customize"): o aspeto de agora com um nome, para voltar a ele num toque. Guarda
 * tudo o que o Customise mexe -- as opções da store (`Aparencia`) e o estilo da
 * capa (`state/capaIOS.ts`) --, e não o destaque (é das Definições) nem o ícone
 * da app (o iOS avisa a cada troca). Ficam no aparelho, como a aparência.
 *
 * Aqui as contas, puras (`scripts/test-presets-da-aparencia.ts`); a store é
 * `state/presetsDaAparencia.ts`.
 */
export type PresetDaAparencia = { id: string; nome: string; aparencia: Aparencia; capa: EstiloDaCapa };

export const MAXIMO_DE_PRESETS = 10;
export const MAXIMO_DO_NOME = 24;

const CAPAS = ESTILOS_DA_CAPA.map((e) => e.valor) as readonly string[];

/** Um nome limpo: sem espaços a mais e no máximo 24 letras. Vazio fica vazio. */
export function nomeDoPreset(nome: string): string {
  return nome.replace(/\s+/g, ' ').trim().slice(0, MAXIMO_DO_NOME).trim();
}

/** O que está guardado, validado: cada aspeto passa pelo `lerAparencia`, sem ids repetidos. */
export function lerPresets(guardado: unknown): PresetDaAparencia[] {
  if (!Array.isArray(guardado)) return [];
  const vistos = new Set<string>();
  const fora: PresetDaAparencia[] = [];
  for (const g of guardado) {
    if (!g || typeof g !== 'object') continue;
    const { id, nome, aparencia, capa } = g as Record<string, unknown>;
    if (typeof id !== 'string' || !id || vistos.has(id) || typeof nome !== 'string' || !nomeDoPreset(nome)) continue;
    vistos.add(id);
    fora.push({
      id,
      nome: nomeDoPreset(nome),
      aparencia: lerAparencia(aparencia),
      capa: typeof capa === 'string' && CAPAS.includes(capa) ? capa as EstiloDaCapa : 'floating',
    });
    if (fora.length >= MAXIMO_DE_PRESETS) break;
  }
  return fora;
}

/** O aspeto como texto, para comparar (o `lerAparencia` põe sempre as chaves pela mesma ordem). */
export function chaveDoAspeto(a: Aparencia, capa: EstiloDaCapa): string {
  return `${JSON.stringify(lerAparencia(a))}|${capa}`;
}

/** O preset que tem o aspeto de agora, se houver (o primeiro). */
export function presetEmUso(presets: readonly PresetDaAparencia[], a: Aparencia, capa: EstiloDaCapa): string | null {
  const chave = chaveDoAspeto(a, capa);
  return presets.find((p) => chaveDoAspeto(p.aparencia, p.capa) === chave)?.id ?? null;
}

/** O nome que a caixa sugere: "Preset 1", "Preset 2"..., o primeiro que ainda não há. */
export function nomeSugerido(presets: readonly PresetDaAparencia[]): string {
  const nomes = new Set(presets.map((p) => p.nome.toLowerCase()));
  for (let n = 1; ; n++) if (!nomes.has(`preset ${n}`)) return `Preset ${n}`;
}

/** Guardar o aspeto de agora. Cheio, ou sem nome, fica como estava. */
export function comPresetNovo(
  presets: readonly PresetDaAparencia[], id: string, nome: string, a: Aparencia, capa: EstiloDaCapa,
): PresetDaAparencia[] {
  const limpo = nomeDoPreset(nome);
  if (!limpo || presets.length >= MAXIMO_DE_PRESETS || presets.some((p) => p.id === id)) return [...presets];
  return [...presets, { id, nome: limpo, aparencia: lerAparencia(a), capa }];
}

export function comNomeNovo(presets: readonly PresetDaAparencia[], id: string, nome: string): PresetDaAparencia[] {
  const limpo = nomeDoPreset(nome);
  if (!limpo) return [...presets];
  return presets.map((p) => (p.id === id ? { ...p, nome: limpo } : p));
}

/** O preset passa a ter o aspeto de agora (o nome fica). */
export function comAspetoNovo(presets: readonly PresetDaAparencia[], id: string, a: Aparencia, capa: EstiloDaCapa): PresetDaAparencia[] {
  return presets.map((p) => (p.id === id ? { ...p, aparencia: lerAparencia(a), capa } : p));
}

export function semPreset(presets: readonly PresetDaAparencia[], id: string): PresetDaAparencia[] {
  return presets.filter((p) => p.id !== id);
}

/** Repor um preset tirado no sítio onde estava (o "Undo"). */
export function comPresetReposto(presets: readonly PresetDaAparencia[], preset: PresetDaAparencia, indice: number): PresetDaAparencia[] {
  if (presets.some((p) => p.id === preset.id)) return [...presets];
  const fora = [...presets];
  fora.splice(Math.max(0, Math.min(indice, fora.length)), 0, preset);
  return fora.slice(0, MAXIMO_DE_PRESETS);
}
