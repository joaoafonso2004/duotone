import { useEffect, useState } from 'react';
import {
  editarPreset, presetDosGanhos, presetsVisiveis, resolverPresets, type MemoriaDePresets,
} from '../lib/presetsDoEqualizador';
import { mudarPresets } from '../state/presets';

/**
 * Mexer numa banda deixa de corresponder à curva guardada, mas não deixa de
 * ser uma edição do preset escolhido. Guardamos a sua identidade, não só a
 * igualdade dos ganhos. Só Update escreve no preset; arrastar ajusta o som.
 */
export function useEdicaoDoPreset({ memoria, ganhos, contexto, bloqueado = false }: {
  memoria: MemoriaDePresets;
  ganhos: readonly number[];
  /** A faixa/saída e a abertura do painel: uma edição não passa para outra. */
  contexto: string;
  bloqueado?: boolean;
}) {
  const [origem, setOrigem] = useState<{ contexto: string; id: string | null } | null>(null);
  useEffect(() => { setOrigem(null); }, [contexto]);
  const correspondente = presetDosGanhos(presetsVisiveis(memoria), ganhos);
  const id = origem?.contexto === contexto ? origem.id : correspondente?.id ?? null;
  // Os presets de origem e o Recommended não se substituem aqui; os teus
  // mantêm o mesmo id, nome, ordem e associações ao carro/auscultadores.
  const preset = !bloqueado ? resolverPresets(memoria).find(p => p.id === id && !p.daApp) ?? null : null;
  const alterado = !!preset && !presetDosGanhos([preset], ganhos);

  return {
    preset,
    alterado,
    escolher: (id: string | null) => setOrigem({ contexto, id }),
    preservarOrigem: () => {
      // Escolher uma pílula e aplicar os ganhos acontece no mesmo toque:
      // não pisar a escolha que acabou de entrar, antes do próximo render.
      setOrigem(anterior => anterior?.contexto === contexto ? anterior : { contexto, id: bloqueado ? null : id });
    },
    atualizar: () => {
      if (!preset || !alterado || bloqueado) return false;
      let mudou = false;
      mudarPresets((m, agora) => {
        // Pode ter sido apagado noutro aparelho entre o render e o toque.
        const atual = resolverPresets(m).find(p => p.id === preset.id && !p.daApp);
        if (!atual || presetDosGanhos([atual], ganhos)) return m;
        mudou = true;
        return editarPreset(m, atual.id, { ganhos }, agora);
      });
      return mudou;
    },
  };
}
