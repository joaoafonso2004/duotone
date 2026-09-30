/**
 * Os presets do equalizador: os da app, os teus, quais aparecem, e qual vale
 * no carro (30/9).
 *
 * **Uma memória só, por linhas, e o mais recente ganha.** É a mesma regra dos
 * ajustes por faixa (`fundirAjustes` no lib/equalizer.ts), e pela mesma razão:
 * dois aparelhos a mexer ao mesmo tempo, cada um offline à vez. Cada preset é
 * uma linha com o seu `visto`, e a escolha do carro é outra -- mudar o nome de
 * um preset no PC não pode desfazer a escolha do carro feita no telemóvel.
 *
 * **Os da app ficam no código; aqui só vive o que mudou neles.** Uma linha de
 * um preset da app diz "escondido", ou "a curva agora é esta", ou "o nome agora
 * é este" -- `null` é "o original". Reafinar um perfil no código continua a
 * chegar a quem nunca lhe mexeu, e "Restore original" é só voltar a `null`.
 *
 * **Os teus apagam-se com uma lápide**, não desaparecendo: sem ela, o outro
 * aparelho, que ainda o tinha, voltava a enviá-lo na sincronização seguinte.
 *
 * Sem imports de runtime (o `./equalizer` também não tem): testável em Node
 * puro, em `scripts/test-presets-do-equalizador.ts`.
 */
import { ePlano, normalizar, PERFIS, type Ganhos } from './equalizer';

export type LinhaDePreset = {
  tipo: 'preset';
  /** O nome escolhido; `null` é o original (só nos da app). */
  nome: string | null;
  /** A curva; `null` é a original (só nos da app). */
  ganhos: Ganhos | null;
  /** Fora da fila de perfis do equalizador. Continua nas Definições. */
  escondido: boolean;
  /** Só nos teus: apagado, e a linha fica para o apagar noutros aparelhos. */
  apagado: boolean;
  /** Só nos teus: quando nasceu, que é a ordem em que aparecem. */
  criado: number;
  visto: number;
};

export type LinhaDoCarro = {
  tipo: 'carro';
  /** O preset que vale no carro; `null` é desligado. */
  preset: string | null;
  /** Os aparelhos Bluetooth que são "o carro", pelo nome que o iOS lhes dá. */
  bluetooth: string[];
  visto: number;
};

export type LinhaDosPresets = LinhaDePreset | LinhaDoCarro;
export type MemoriaDePresets = Record<string, LinhaDosPresets>;

/** A linha da escolha do carro. Não colide com preset nenhum: os teus
 * começam por `u-`, e os da app são os ids do `PERFIS`. */
export const CHAVE_DO_CARRO = 'carro';

/** Um preset como a app o mostra: já com o que mudou por cima do original. */
export type Preset = {
  id: string;
  nome: string;
  ganhos: Ganhos;
  daApp: boolean;
  /** Um da app com nome ou curva mudados. */
  editado: boolean;
  escondido: boolean;
};

export const NOME_MAXIMO = 30;

const eDaApp = (id: string) => PERFIS.some((p) => p.id === id);
const iguais = (a: readonly number[], b: readonly number[]) => {
  const x = normalizar(a), y = normalizar(b);
  return x.every((v, i) => v === y[i]);
};

function linhaDePreset(m: MemoriaDePresets, id: string): LinhaDePreset | null {
  const l = m[id];
  return l && l.tipo === 'preset' ? l : null;
}

/** Todos, pela ordem em que aparecem: os da app primeiro, e os teus pela
 * ordem em que foram criados. Os escondidos vêm também, marcados. */
export function resolverPresets(m: MemoriaDePresets): Preset[] {
  const daApp: Preset[] = PERFIS.map((p) => {
    const l = linhaDePreset(m, p.id);
    return {
      id: p.id,
      nome: l?.nome ?? p.nome,
      ganhos: normalizar(l?.ganhos ?? p.ganhos),
      daApp: true,
      editado: !!l && (l.nome !== null || l.ganhos !== null),
      escondido: !!l?.escondido,
    };
  });
  const teus = Object.entries(m)
    .filter((e): e is [string, LinhaDePreset] =>
      e[1].tipo === 'preset' && !eDaApp(e[0]) && !e[1].apagado && !!e[1].ganhos && !!e[1].nome)
    .sort((a, b) => a[1].criado - b[1].criado || a[0].localeCompare(b[0]))
    .map(([id, l]) => ({
      id,
      nome: l.nome!,
      ganhos: normalizar(l.ganhos),
      daApp: false,
      editado: false,
      escondido: l.escondido,
    }));
  return [...daApp, ...teus];
}

export function presetsVisiveis(m: MemoriaDePresets): Preset[] {
  return resolverPresets(m).filter((p) => !p.escondido);
}

/** O preset que tem exatamente esta curva, entre os que se passam. */
export function presetDosGanhos<P extends { ganhos: readonly number[] }>(
  lista: readonly P[], ganhos: readonly number[],
): P | null {
  return lista.find((p) => iguais(p.ganhos, ganhos)) ?? null;
}

/** O nome como fica guardado: sem espaços a mais e dentro do limite. Vazio
 * não é nome nenhum. */
export function limparNome(nome: string): string | null {
  const limpo = nome.replace(/\s+/g, ' ').trim().slice(0, NOME_MAXIMO).trim();
  return limpo || null;
}

/** Um id novo para um preset teu. O `agora` e o acaso vêm de fora para os
 * testes; dois aparelhos a criar no mesmo milissegundo não colidem. */
export function novoIdDePreset(agora: number, acaso: number): string {
  return `u-${agora.toString(36)}-${Math.floor(acaso * 1e9).toString(36)}`;
}

/** O `visto` seguinte desta linha: nunca anda para trás, nem no mesmo ms. */
function vistoDe(m: MemoriaDePresets, id: string, agora: number): number {
  return Math.max(agora, (m[id]?.visto ?? 0) + 1);
}

export function criarPreset(
  m: MemoriaDePresets, id: string, nome: string, ganhos: readonly number[], agora: number,
): MemoriaDePresets {
  const limpo = limparNome(nome);
  if (!limpo || eDaApp(id) || id === CHAVE_DO_CARRO) return m;
  return {
    ...m,
    [id]: {
      tipo: 'preset', nome: limpo, ganhos: normalizar(ganhos), escondido: false,
      apagado: false, criado: agora, visto: vistoDe(m, id, agora),
    },
  };
}

/**
 * Muda o nome e/ou a curva. Num da app, voltar ao original guarda `null`:
 * assim "igual ao original" e "restaurado" são a mesma coisa, e uma reafinação
 * futura do perfil chega-lhe.
 */
export function editarPreset(
  m: MemoriaDePresets, id: string, mudancas: { nome?: string; ganhos?: readonly number[] }, agora: number,
): MemoriaDePresets {
  const original = PERFIS.find((p) => p.id === id);
  const l = linhaDePreset(m, id);
  if (!original && (!l || l.apagado)) return m;
  let nome = l?.nome ?? null;
  let ganhos = l?.ganhos ?? null;
  if (mudancas.nome !== undefined) {
    const limpo = limparNome(mudancas.nome);
    if (!limpo) return m;
    nome = original && limpo === original.nome ? null : limpo;
  }
  if (mudancas.ganhos !== undefined) {
    const g = normalizar(mudancas.ganhos);
    ganhos = original && iguais(g, original.ganhos) ? null : g;
  }
  return {
    ...m,
    [id]: {
      tipo: 'preset', nome, ganhos, escondido: l?.escondido ?? false,
      apagado: false, criado: l?.criado ?? 0, visto: vistoDe(m, id, agora),
    },
  };
}

/** Um da app de volta ao nome e à curva originais. Fica escondido se estava. */
export function reporPreset(m: MemoriaDePresets, id: string, agora: number): MemoriaDePresets {
  if (!eDaApp(id)) return m;
  const l = linhaDePreset(m, id);
  return {
    ...m,
    [id]: {
      tipo: 'preset', nome: null, ganhos: null, escondido: l?.escondido ?? false,
      apagado: false, criado: 0, visto: vistoDe(m, id, agora),
    },
  };
}

/** Só os teus. Se era o do carro, o carro fica sem preset -- não fica a
 * apontar para um que já não existe. */
export function apagarPreset(m: MemoriaDePresets, id: string, agora: number): MemoriaDePresets {
  const l = linhaDePreset(m, id);
  if (eDaApp(id) || !l || l.apagado) return m;
  const saida: MemoriaDePresets = {
    ...m,
    [id]: { ...l, nome: null, ganhos: null, apagado: true, visto: vistoDe(m, id, agora) },
  };
  const carro = linhaDoCarro(m);
  return carro.preset === id ? definirPresetDoCarro(saida, null, agora) : saida;
}

export function mostrarPreset(
  m: MemoriaDePresets, id: string, visivel: boolean, agora: number,
): MemoriaDePresets {
  const l = linhaDePreset(m, id);
  if (!eDaApp(id) && (!l || l.apagado)) return m;
  return {
    ...m,
    [id]: {
      tipo: 'preset', nome: l?.nome ?? null, ganhos: l?.ganhos ?? null, escondido: !visivel,
      apagado: false, criado: l?.criado ?? 0, visto: vistoDe(m, id, agora),
    },
  };
}

// ------------------------------------------------------------- o carro ----

export function linhaDoCarro(m: MemoriaDePresets): LinhaDoCarro {
  const l = m[CHAVE_DO_CARRO];
  return l && l.tipo === 'carro' ? l : { tipo: 'carro', preset: null, bluetooth: [], visto: 0 };
}

/** O preset do carro, já resolvido; `null` se está desligado ou se o preset
 * deixou de existir. Um escondido continua a valer no carro: esconder é da
 * fila de perfis, não do carro. */
export function presetDoCarro(m: MemoriaDePresets): Preset | null {
  const id = linhaDoCarro(m).preset;
  return id ? resolverPresets(m).find((p) => p.id === id) ?? null : null;
}

export function definirPresetDoCarro(m: MemoriaDePresets, id: string | null, agora: number): MemoriaDePresets {
  const l = linhaDoCarro(m);
  return { ...m, [CHAVE_DO_CARRO]: { ...l, preset: id, visto: vistoDe(m, CHAVE_DO_CARRO, agora) } };
}

export function marcarBluetoothDoCarro(
  m: MemoriaDePresets, nome: string, eOCarro: boolean, agora: number,
): MemoriaDePresets {
  const limpo = nome.trim();
  if (!limpo) return m;
  const l = linhaDoCarro(m);
  const sem = l.bluetooth.filter((n) => n !== limpo);
  const bluetooth = eOCarro ? [...sem, limpo].slice(-10) : sem;
  return { ...m, [CHAVE_DO_CARRO]: { ...l, bluetooth, visto: vistoDe(m, CHAVE_DO_CARRO, agora) } };
}

/** Por onde sai o som, como o `modules/duotone-remote-commands` o diz. */
export type Saida = { tipo: string; nome: string };

/** O `portType` do CarPlay (`AVAudioSession.Port.carAudio`). */
export const PORTA_DO_CARPLAY = 'CarAudio';
const PORTAS_BLUETOOTH = new Set(['BluetoothA2DPOutput', 'BluetoothHFP', 'BluetoothLE']);

export function eBluetooth(saida: Saida | null): boolean {
  return !!saida && PORTAS_BLUETOOTH.has(saida.tipo);
}

/** Estamos no carro? O CarPlay é sempre; um Bluetooth, só se foi marcado. */
export function estaNoCarro(saida: Saida | null, m: MemoriaDePresets): boolean {
  if (!saida) return false;
  if (saida.tipo === PORTA_DO_CARPLAY) return true;
  return eBluetooth(saida) && linhaDoCarro(m).bluetooth.includes(saida.nome.trim());
}

// ------------------------------------------------------- sincronização ----

/** A mais recente de cada linha. A mesma regra do `fundirAjustes`. */
export function fundirPresets(local: MemoriaDePresets, remoto: MemoriaDePresets): MemoriaDePresets {
  const saida: MemoriaDePresets = { ...local };
  for (const [chave, doServidor] of Object.entries(remoto)) {
    const daqui = saida[chave];
    if (!daqui || doServidor.visto > daqui.visto) saida[chave] = doServidor;
  }
  return saida;
}

/** Uma linha lida de fora (disco ou servidor), ou `null` se não se percebe. */
export function lerLinha(chave: string, cru: unknown, visto: number): LinhaDosPresets | null {
  if (!Number.isFinite(visto) || !cru || typeof cru !== 'object') return null;
  const d = cru as Record<string, unknown>;
  if (chave === CHAVE_DO_CARRO) {
    const bluetooth = Array.isArray(d.bluetooth)
      ? d.bluetooth.filter((n): n is string => typeof n === 'string' && !!n.trim()).slice(-10)
      : [];
    return { tipo: 'carro', preset: typeof d.preset === 'string' ? d.preset : null, bluetooth, visto };
  }
  const nome = typeof d.nome === 'string' ? limparNome(d.nome) : null;
  const ganhos = Array.isArray(d.ganhos) ? normalizar(d.ganhos as number[]) : null;
  return {
    tipo: 'preset', nome, ganhos, escondido: d.escondido === true, apagado: d.apagado === true,
    criado: Number.isFinite(d.criado) ? Number(d.criado) : 0, visto,
  };
}

/** O que vai para o servidor: a linha sem o `visto` (esse vai à parte). */
export function dadosDaLinha(l: LinhaDosPresets): Record<string, unknown> {
  const { visto: _visto, ...dados } = l;
  return dados;
}

export function daPersistenciaDePresets(cru: string | null | undefined): MemoriaDePresets {
  if (!cru) return {};
  try {
    const obj = JSON.parse(cru) as Record<string, { visto?: unknown }>;
    const saida: MemoriaDePresets = {};
    for (const [chave, valor] of Object.entries(obj ?? {})) {
      const l = lerLinha(chave, valor, Number(valor?.visto));
      if (l) saida[chave] = l;
    }
    return saida;
  } catch {
    return {};
  }
}

/** "6 of 8 shown", para as Definições. */
export function resumoDosPresets(m: MemoriaDePresets): string {
  const todos = resolverPresets(m);
  const vistos = todos.filter((p) => !p.escondido).length;
  const carro = presetDoCarro(m);
  return `${vistos} of ${todos.length} shown${carro ? ` · ${carro.nome} in the car` : ''}`;
}

/** Guardar a curva actual como preset faz sentido? Só se ainda não for um. */
export function podeGuardarComoPreset(m: MemoriaDePresets, ganhos: readonly number[]): boolean {
  return !ePlano(ganhos) && !presetDosGanhos(resolverPresets(m), ganhos);
}
