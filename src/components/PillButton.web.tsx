import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { Button } from '../desktop/ui.web';

/**
 * A `PillButton` no PC (24/11, a lista "Refinar o PC"): o botão do PC. As folhas do iPhone
 * abrem no PC como diálogo (`BottomSheet.web.tsx`), e lá dentro ficava o botão do telemóvel,
 * uma pílula com o gradiente do tema (Report a problem, o ListenBrainz, as confirmações).
 * As mesmas props: o `small` não muda nada (os botões do PC têm um tamanho só), e o `style`
 * fica num invólucro que encosta o botão à direita, como as ações dos diálogos do PC.
 */
interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
  style?: ViewStyle;
}

export function PillButton({ label, onPress, variant = 'primary', loading = false, disabled = false, style }: Props) {
  return (
    <View style={[{ alignItems: 'flex-end' }, style]}>
      <Button onPress={onPress} secondary={variant === 'ghost'} danger={variant === 'danger'} disabled={disabled} ocupado={loading}>
        {label}
      </Button>
    </View>
  );
}
