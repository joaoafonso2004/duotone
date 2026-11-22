import type React from 'react';
import type { TextInput } from 'react-native';
import type { SocialFriend } from '../state/social';
import type { Track } from '../types';

/**
 * As props das peças do Social do PC (22/11, a B4), partilhadas pelo par
 * `SocialPc.tsx` (o iPhone: nada, ou o `SocialModal` de sempre) e
 * `SocialPc.web.tsx` (o PC). O `SocialHub` é partilhado e só as chama nos ramos web.
 */
export type DialogoDoSocialProps = { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; largura?: number };

export type CabecalhoDaConversaProps = {
  titulo: string;
  amigo: SocialFriend | null;
  /** "Online now", "Last seen …": o estado quando não está a ouvir. */
  estado: string;
  /** O painel dele está à vista? Então o Listen along vive lá; senão, aqui. */
  comPainel: boolean;
  /** Play all e Save as playlist (`MusicasDaConversa`), na linha do cabeçalho. */
  acoes?: React.ReactNode;
  aoPerfil: () => void;
  /** Start a Jam (ele não está a ouvir) ou Listen along (está, sem o painel). */
  aoOuvirJuntos: () => void;
  aoFechar: () => void;
  /** Com a lista ao lado, o X fecha a conversa; sozinha, a seta volta. */
  aoLado: boolean;
};

export type CampoDeEscreverProps = {
  campoRef: React.RefObject<TextInput | null>;
  valor: string;
  aoMudar: (texto: string) => void;
  ocupado: boolean;
  aoEnviar: () => void;
  /** O "+": mandar música sem sair da conversa. */
  aoEnviarMusica: () => void;
  /** A música que toca: com o campo vazio, o ♪ manda-a. */
  aTocar: Track | null;
  aoEnviarATocar: () => void;
};

export type LayoutDaConversaProps = {
  /** A conversa aberta (`id` ou `group:<id>`): trocar de conversa anima a entrada da nova. */
  chave: string;
  /** O amigo da conversa a dois (num grupo, `null`: sem painel nem cor). */
  amigo: SocialFriend | null;
  /** A largura do Social: abaixo de `SOCIAL_COM_PAINEL` o painel não aparece. */
  largura: number;
  children: React.ReactNode;
};
