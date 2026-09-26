import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { sessoesDeAmigos } from '../api/ouvirJuntos';
import { FriendAvatar } from '../components/FriendAvatar';
import { displayArtist, tituloDaFaixa } from '../lib/artistName';
import { amigosNaLateral } from '../lib/amigosNaLateral';
import { posicaoDoAmigo } from '../lib/posicaoDoAmigo';
import { ouvirComAmigo } from '../state/ouvirComAmigo';
import { agoraNoServidor, useSocial } from '../state/social';
import type { Route } from './rotas';
import { COR, ESP, FONT, TIPO } from './tokens.web';
import { marcar } from './ui.web';

/**
 * Os amigos que estão na app, por baixo da tua conta (26/9, pedido do João:
 * "no espaço livre abaixo do meu perfil"). Quem está a ouvir mostra a música e
 * o progresso; quem está só na app diz "Online". Com o rato numa linha aparece
 * o ▶ para ouvires com ele (state/ouvirComAmigo.ts); clicar na linha abre a
 * conversa. Sem ninguém online não aparece nada -- nem o título.
 *
 * O ▶ mostra-se pelo CSS (`amigo`/`amigo-ouvir`, no casca.web.tsx) e não pelo
 * `hovered` do RNW: é clicável dentro de uma linha clicável, e o hover do pai
 * cai quando o rato entra no filho (ver "O movimento do PC" no CLAUDE.md).
 */
export function AmigosNaLateral({ navigate }: { navigate: (r: Route) => void }) {
  const amigos = useSocial((s) => s.friends);
  const { visiveis, resto, online } = useMemo(() => amigosNaLateral(amigos), [amigos]);
  const aOuvir = visiveis.filter((a) => a.currentlyPlaying).length;

  // As sessões abertas, para "ouvir com" entrar no jam dele em vez de só tocar
  // a mesma música. Pergunta-se quando muda quem está a ouvir, não de contínuo.
  const [sessoes, setSessoes] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!aOuvir) { setSessoes(new Map()); return; }
    let vivo = true;
    void sessoesDeAmigos().then((m) => { if (vivo) setSessoes(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [aOuvir]);

  // As barras andam de segundo a segundo, e só enquanto alguém está a ouvir.
  const [, setTique] = useState(0);
  useEffect(() => {
    if (!aOuvir) return;
    const id = setInterval(() => setTique((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [aOuvir]);

  if (!visiveis.length) return null;
  const agora = agoraNoServidor();

  return (
    <View style={{ paddingHorizontal: ESP.md, paddingTop: ESP.md, paddingBottom: ESP.sm, gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: ESP.sm, paddingBottom: ESP.sm }}>
        <Text style={{ ...TIPO.micro, color: COR.textoFraco }}>FRIENDS</Text>
        <Text style={{ ...TIPO.micro, color: COR.textoFraco }}>{online} ONLINE</Text>
      </View>
      {visiveis.map((a) => {
        const faixa = a.currentlyPlaying;
        const onde = posicaoDoAmigo(faixa, agora);
        const nome = a.name || a.username;
        return (
          <Pressable
            key={a.friendId}
            {...marcar('amigo')}
            // Sem papel de botão: o ▶ lá dentro é que o é, e um <button> dentro
            // de outro é HTML inválido (o browser apanhou-o no ensaio de 26/9).
            accessibilityLabel={faixa ? `${nome}, listening to ${tituloDaFaixa(faixa)}. Open chat` : `${nome}, online. Open chat`}
            onPress={() => navigate({ name: 'social', friendId: a.friendId })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingHorizontal: ESP.sm, borderRadius: 8 }}
          >
            <View style={{ width: 32, height: 32 }}>
              <FriendAvatar avatarUrl={a.avatarUrl} name={nome} size={32} />
              <View style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: COR.ok, borderWidth: 2, borderColor: COR.painel }} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 13, fontWeight: '600', color: COR.texto }}>{nome}</Text>
              <Text numberOfLines={1} style={{ fontFamily: FONT.body, fontSize: 11.5, marginTop: 1, color: faixa ? COR.textoMedio : COR.textoFraco }}>
                {faixa ? `${tituloDaFaixa(faixa)} · ${displayArtist(faixa)}` : 'Online'}
              </Text>
              {onde ? (
                <View style={{ height: 2, borderRadius: 1, backgroundColor: 'rgba(233,234,238,0.14)', marginTop: 5, overflow: 'hidden' }}>
                  <View style={{ height: 2, width: `${Math.round(onde.fracao * 1000) / 10}%`, backgroundColor: COR.texto, transition: 'width 1s linear' } as any} />
                </View>
              ) : null}
            </View>
            {faixa ? (
              <Pressable
                {...marcar('amigo-ouvir')}
                accessibilityRole="button"
                accessibilityLabel={sessoes.has(a.friendId) ? `Join ${nome}'s session` : `Listen along with ${nome}`}
                onPress={(e: any) => { e?.stopPropagation?.(); void ouvirComAmigo(a, sessoes.get(a.friendId)); }}
                style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: COR.texto, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name={sessoes.has(a.friendId) ? 'people' : 'play'} size={12} color={COR.fundo} />
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}
      {resto > 0 ? (
        <Pressable {...marcar('amigo')} onPress={() => navigate({ name: 'social' })}
          style={{ paddingVertical: 6, paddingHorizontal: ESP.sm, borderRadius: 8 }}>
          <Text style={{ fontFamily: FONT.body, fontSize: 12, color: COR.textoFraco }}>{`+${resto} more online`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
