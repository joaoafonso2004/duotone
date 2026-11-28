import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { Platform, type NativeSyntheticEvent, type ViewProps } from 'react-native';

/** Um botão da barra: o nome, o símbolo do sistema (contorno e, escolhido, cheio) e o ponto vermelho. */
export type ItemDoSeparador = {
  titulo: string;
  simbolo: string;
  simboloEscolhido: string;
  ponto: boolean;
};

export type PropsDosSeparadores = ViewProps & {
  itens: ItemDoSeparador[];
  /** O botão escolhido; -1 para nenhum (o Social, que não tem botão). */
  escolhido: number;
  comNomes: boolean;
  /** Cores pelo `processColor`. */
  corEscolhida?: number | null;
  corOutros?: number | null;
  /** 0 a 1: o fundo escuro por baixo da cápsula (a opacidade da Customise). */
  opacidade: number;
  onEscolher?: (e: NativeSyntheticEvent<{ indice: number }>) => void;
  onAltura?: (e: NativeSyntheticEvent<{ altura: number }>) => void;
  /** Uma vez por arranque: as vistas da barra, a cápsula que se achou e se ficou transparente. */
  onDiagnostico?: (e: NativeSyntheticEvent<{ arvore: string; capsula: string; limpa: boolean; altura: number }>) => void;
};

const nativo = Platform.OS === 'ios' ? requireOptionalNativeModule('DuotoneSeparadores') : null;

/**
 * A barra de separadores do sistema, a `UITabBar` do iOS 26 com a lente de vidro
 * (ver ios/DuotoneSeparadoresModule.swift). `null` fora do iPhone e num binário sem
 * o módulo (anterior a 28/11): aí fica a cápsula de vidro em JavaScript.
 */
export const SeparadoresNativos: ComponentType<PropsDosSeparadores> | null =
  nativo ? requireNativeView<PropsDosSeparadores>('DuotoneSeparadores') : null;
