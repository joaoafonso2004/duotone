import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { lerMisturaDosDois, lerVocesOsDois, valeAPena, type VocesOsDois } from '../../api/vocesOsDois';
import { contextoDaPrateleira } from '../../lib/contextoDaDescoberta';
import { useAuth } from '../../state/auth';
import { useTheme } from '../../state/theme';
import type { DiscoveryContext } from '../../lib/contextoDaDescoberta';
import type { Track } from '../../types';
import { styles } from '../estilos.web';
import { BotaoVoltar, Button, ContentScroll, desktop, Empty, Loading, Page } from '../ui.web';

const V = View as any;

/**
 * "You two" no PC (5/10, auditoria de consistência A1). Só existia no iPhone
 * (`VocesOsDoisScreen`): a `ProfilePage.web` não passava o `onVocesOsDois` e o
 * botão sumia do perfil do amigo, sem erro. Os mesmos dados
 * (`api/vocesOsDois.ts`) e a mesma mistura dos dois; o desenho é o do PC.
 */
export function VocesOsDoisPage({ userId, nome, back, play }: {
  userId: string; nome?: string; back: () => void;
  play: (t: Track, q?: Track[], contexto?: DiscoveryContext) => void;
}) {
  const tema = useTheme((s) => s.theme);
  const meuId = useAuth((s) => s.session?.user?.id);
  const [dados, setDados] = useState<VocesOsDois | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [mistura, setMistura] = useState<Track[]>([]);

  useEffect(() => {
    let vivo = true;
    setACarregar(true);
    void lerVocesOsDois(userId)
      .then((d) => { if (vivo) setDados(d); })
      .finally(() => { if (vivo) setACarregar(false); });
    return () => { vivo = false; };
  }, [userId]);

  useEffect(() => {
    // Ao saltar de um amigo para outro, o botão antigo não toca a mistura da pessoa anterior.
    setMistura([]);
    if (!meuId) return;
    let vivo = true;
    void lerMisturaDosDois(meuId, userId).then((m) => { if (vivo) setMistura(m); }).catch(() => {});
    return () => { vivo = false; };
  }, [meuId, userId]);

  const primeiro = nome?.split(' ')[0] || nome || 'them';
  const d = dados;

  return <Page title="You two" subtitle={nome ? `You and ${nome}` : undefined} action={<BotaoVoltar onPress={back} />}>
    <ContentScroll>
      {aCarregar ? <View style={{ height: 320 }}><Loading /></View>
        : !valeAPena(d) || !d ? <Empty icon="sparkles-outline" title="Not enough yet" body={`Once you and ${primeiro} have both listened for a while, this page fills up with what you share — and what you don't.`} />
        : <View style={{ maxWidth: 760, width: '100%', alignSelf: 'center', gap: 14 }}>
          <V style={[styles.statsHero, { alignItems: 'center', backgroundImage: `linear-gradient(135deg, ${tema.gradient[0]}, ${tema.gradient[1]})` } as any]}>
            <Text style={{ color: '#fff', fontSize: 64, fontWeight: '800', letterSpacing: -2 }}>{d.compatibilidade}%</Text>
            <Text style={styles.statsHeroNote}>taste in common</Text>
            {d.artistasEmComum > 0 && <Text style={[styles.statsHeroNote, { opacity: 0.75 }]}>{d.artistasEmComum} {d.artistasEmComum === 1 ? 'artist' : 'artists'} you both play</Text>}
          </V>

          {mistura.length > 0 && <View style={{ alignItems: 'flex-start' }}>
            <Button icon="play" onPress={() => play(mistura[0], mistura, contextoDaPrateleira('amigos'))}>{`Play a mix of you two · ${mistura.length} songs`}</Button>
          </View>}

          {d.obsessao && <Linha capa={d.obsessao.capa} icone="flame-outline" etiqueta="Your shared obsession" titulo={d.obsessao.nome} nota={`${d.obsessao.meu} plays vs ${d.obsessao.teu}`} />}
          {d.divide && <Linha capa={d.divide.capa} icone="git-compare-outline"
            etiqueta={d.divide.deQuem === 'eu' ? `${primeiro} has never played this` : 'You have never played this'}
            titulo={d.divide.titulo} nota={`${d.divide.artista ?? ''}${d.divide.artista ? ' · ' : ''}${d.divide.vezes} plays`} />}
          {d.eleTraria && <Linha capa={d.eleTraria.capa} icone="gift-outline" etiqueta={`${primeiro} would bring you`} titulo={d.eleTraria.nome} nota={`${d.eleTraria.vezes} plays, and none of them yours`} />}
          {d.tuTrarias && <Linha capa={d.tuTrarias.capa} icone="gift-outline" etiqueta={`You would bring ${primeiro}`} titulo={d.tuTrarias.nome} nota={`${d.tuTrarias.vezes} plays, and none of them theirs`} />}

          {(d.cheguei > 0 || d.chegaste > 0) && <View style={[styles.statsRow, { padding: 18 }]}>
            <Metade numero={d.cheguei} texto="you got there first" cor={tema.color} />
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: desktop.border }} />
            <Metade numero={d.chegaste} texto={`${primeiro} did`} cor={desktop.muted} />
          </View>}
        </View>}
    </ContentScroll>
  </Page>;
}

function Linha({ capa, icone, etiqueta, titulo, nota }: {
  capa: string | null; icone: keyof typeof Ionicons.glyphMap; etiqueta: string; titulo: string; nota: string;
}) {
  return <View style={[styles.statsRow, { padding: 12 }]}>
    {capa ? <Image source={{ uri: capa }} style={{ width: 56, height: 56, borderRadius: 8 }} />
      : <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: desktop.raised, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icone} size={20} color={desktop.dim} /></View>}
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text style={styles.formLabel}>{etiqueta.toUpperCase()}</Text>
      <Text numberOfLines={2} style={{ color: desktop.text, fontSize: 14, fontWeight: '600' }}>{titulo}</Text>
      <Text numberOfLines={1} style={{ color: desktop.muted, fontSize: 12 }}>{nota}</Text>
    </View>
  </View>;
}

function Metade({ numero, texto, cor }: { numero: number; texto: string; cor: string }) {
  return <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
    <Text style={{ color: cor, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>{numero}</Text>
    <Text style={{ color: desktop.muted, fontSize: 12, textAlign: 'center' }}>{texto}</Text>
  </View>;
}
