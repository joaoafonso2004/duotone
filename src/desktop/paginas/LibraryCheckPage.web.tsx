import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { tituloDaFaixa } from '../../lib/artistName';
import {
  duracaoCurta, motivoDaIndisponivel, resumoDoRelatorio, type GrupoDeDuplicados,
} from '../../lib/higieneDaBiblioteca';
import { comCatalogo } from '../../state/catalogoDeFaixas';
import { useConnectivity } from '../../state/connectivity';
import { useOuvirJuntos } from '../../state/ouvirJuntos';
import {
  CHAVE_DO_DESFAZER, chaveDaCapa, chaveDaIndisponivel, chaveDoGrupo, corrigirCapaDe, desfazerUltima,
  juntarGrupo, pararVerificacao, procurarCopiaPara, substituirPelaCopia, useVerificacaoDaBiblioteca,
  verificarBiblioteca, type Indisponivel,
} from '../../state/verificacaoDaBiblioteca';
import type { Track } from '../../types';
import { COR, ESP, RAIO, TIPO } from '../tokens.web';
import { Artwork, Button, ContentScroll, Page } from '../ui.web';

/**
 * O Library check no PC. A mesma verificação e as mesmas ações do iPhone
 * (`state/verificacaoDaBiblioteca.ts`), desenhadas com as peças do desktop.
 */
export function LibraryCheckPage({ back, play }: { back: () => void; play: (track: Track, queue?: Track[]) => void }) {
  const v = useVerificacaoDaBiblioteca();
  const offline = useConnectivity((s) => s.offline);
  const aVerificar = v.fase === 'a-verificar';
  const pendentes = {
    duplicados: v.duplicados.filter((g) => !v.resolvidos[chaveDoGrupo(g)]).length,
    indisponiveis: v.indisponiveis.filter((i) => !v.resolvidos[chaveDaIndisponivel(i)]).length,
    capas: v.capas.filter((c) => !v.resolvidos[chaveDaCapa(c)]).length,
  };

  return (
    <Page
      title="Library check"
      subtitle="Songs saved twice, videos that no longer play and covers that don't load. Nothing changes until you click."
      action={<Button secondary icon="arrow-back" onPress={back}>Settings</Button>}
    >
      <ContentScroll scrollKey="library-check">
        <View style={s.cabeca}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            {v.progresso ? (
              <Text style={s.estado}>
                {v.progresso.total ? `Checking ${v.progresso.feitas} of ${v.progresso.total}…` : 'Reading your library…'}
              </Text>
            ) : v.fase === 'feita' ? (
              <Text style={s.resumo}>{resumoDoRelatorio(pendentes)}</Text>
            ) : (
              <Text style={s.estado}>Checks every song in your library and playlists.</Text>
            )}
            {v.interrompida ? <Text style={s.nota}>Stopped before the end — this is what it found so far.</Text> : null}
            {offline && !aVerificar ? <Text style={s.nota}>Needs internet.</Text> : null}
            {v.erro && !v.erroEm ? <Text style={[s.nota, { color: COR.erro }]}>{v.erro}</Text> : null}
          </View>
          {aVerificar
            ? <Button secondary onPress={pararVerificacao}>Stop</Button>
            : <Button disabled={offline} onPress={() => void verificarBiblioteca()}>{v.fase === 'feita' ? 'Check again' : 'Check library'}</Button>}
        </View>

        {v.ultima ? (
          <View style={s.desfazer}>
            <Ionicons name="checkmark-circle" size={17} color={COR.ok} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={s.titulo}>{v.ultima.rotulo}</Text>
              <ErroNaLinha chave={CHAVE_DO_DESFAZER} />
            </View>
            <Button secondary disabled={v.aTratar === CHAVE_DO_DESFAZER} onPress={() => void desfazerUltima()}>Undo</Button>
          </View>
        ) : null}

        {v.duplicados.length ? (
          <>
            <Text style={s.seccao}>SAVED TWICE</Text>
            <Text style={s.explicacao}>The same recording saved from different uploads. Merge keeps the one you pick, and your playlists move to it.</Text>
            {v.duplicados.map((g) => <Grupo key={chaveDoGrupo(g)} grupo={g} offline={offline} />)}
          </>
        ) : null}

        {v.indisponiveis.length ? (
          <>
            <Text style={s.seccao}>NO LONGER PLAYS</Text>
            {v.indisponiveis.map((i) => <Morta key={chaveDaIndisponivel(i)} item={i} offline={offline} play={play} />)}
          </>
        ) : null}

        {v.capas.length ? (
          <>
            <Text style={s.seccao}>COVERS THAT DON'T LOAD</Text>
            <Text style={s.explicacao}>Fix uses the video's own thumbnail.</Text>
            <View style={s.cartao}>
              {v.capas.map((c) => {
                const chave = chaveDaCapa(c);
                const feito = v.resolvidos[chave];
                return (
                  <View key={chave}>
                    <View style={s.linha}>
                      <View style={[s.capa, s.semCapa]}><Ionicons name="image-outline" size={16} color={COR.textoFraco} /></View>
                      <Ionicons name="arrow-forward" size={14} color={COR.textoFraco} />
                      <Image source={{ uri: c.nova }} style={s.capa} />
                      <Texto faixa={c.faixa} />
                      {feito ? <Feito rotulo={feito} /> : (
                        <Button secondary disabled={offline || v.aTratar === chave} onPress={() => void corrigirCapaDe(c)}>Fix</Button>
                      )}
                    </View>
                    <ErroNaLinha chave={chave} recuo />
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        {v.fase === 'feita' && !v.duplicados.length && !v.indisponiveis.length && !v.capas.length ? (
          <View style={s.vazio}>
            <Ionicons name="checkmark-circle-outline" size={30} color={COR.ok} />
            <Text style={s.titulo}>Your library is in good shape</Text>
          </View>
        ) : null}
      </ContentScroll>
    </Page>
  );
}

function Texto({ faixa, nota }: { faixa: Track; nota?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={s.titulo}>{tituloDaFaixa(faixa)}</Text>
      <Text numberOfLines={1} style={s.meta}>{[faixa.artist, duracaoCurta(faixa.durationSeconds), nota].filter(Boolean).join(' · ')}</Text>
    </View>
  );
}

/** O erro da ação deste problema, junto dele: lá em cima podia nem se ver. */
function ErroNaLinha({ chave, recuo = false }: { chave: string; recuo?: boolean }) {
  const erro = useVerificacaoDaBiblioteca((st) => (st.erroEm === chave ? st.erro : null));
  if (!erro) return null;
  return <Text style={[s.meta, { color: COR.erro }, recuo && s.erroRecuado]}>{erro}</Text>;
}

function Feito({ rotulo }: { rotulo: string }) {
  return (
    <View style={s.feito}>
      <Ionicons name="checkmark" size={14} color={COR.ok} />
      <Text style={[s.meta, { color: COR.ok }]}>{rotulo}</Text>
    </View>
  );
}

function Grupo({ grupo, offline }: { grupo: GrupoDeDuplicados; offline: boolean }) {
  const chave = chaveDoGrupo(grupo);
  const feito = useVerificacaoDaBiblioteca((st) => st.resolvidos[chave]);
  const ficou = useVerificacaoDaBiblioteca((st) => st.ficou[chave]);
  const naoTocam = useVerificacaoDaBiblioteca((st) => st.naoTocam);
  const aTratar = useVerificacaoDaBiblioteca((st) => st.aTratar === chave);
  const [fica, setFica] = useState(grupo.fica);
  useEffect(() => { setFica(grupo.fica); }, [grupo.fica]);

  return (
    <View style={s.cartao}>
      {grupo.faixas.map((t) => {
        const escolhida = t.id === fica.id;
        // Depois de juntar, a que saiu fica à vista mas apagada: vê-se qual ficou.
        const saiu = !!feito && !!ficou && t.id !== ficou;
        return (
          <Pressable
            key={t.id}
            disabled={!!feito}
            onPress={() => setFica(t)}
            accessibilityRole="radio"
            accessibilityState={{ selected: escolhida }}
            accessibilityLabel={`Keep ${tituloDaFaixa(t)} by ${t.artist ?? 'unknown'}`}
            style={({ hovered }: any) => [s.linha, hovered && !feito && s.linhaHover, saiu && { opacity: 0.4 }]}
          >
            <Artwork track={comCatalogo(t)} size={40} />
            <Texto faixa={t} nota={saiu ? 'Removed' : naoTocam.includes(t.sourceId) ? "Doesn't play" : undefined} />
            {!feito ? (
              <Ionicons name={escolhida ? 'checkmark-circle' : 'ellipse-outline'} size={19}
                color={escolhida ? COR.texto : COR.textoFraco} />
            ) : null}
          </Pressable>
        );
      })}
      <View style={s.acoes}>
        {feito ? <Feito rotulo={feito} /> : (
          <>
            <Text style={[s.meta, { flex: 1 }]}>Keeps the one ticked.</Text>
            <Button disabled={offline || aTratar} onPress={() => void juntarGrupo(grupo, fica)}>Merge</Button>
          </>
        )}
      </View>
      <ErroNaLinha chave={chave} recuo />
    </View>
  );
}

function Morta({ item, offline, play }: { item: Indisponivel; offline: boolean; play: (track: Track, queue?: Track[]) => void }) {
  const emJam = useOuvirJuntos((st) => !!st.sessao);
  const chave = chaveDaIndisponivel(item);
  const feito = useVerificacaoDaBiblioteca((st) => st.resolvidos[chave]);
  const aTratar = useVerificacaoDaBiblioteca((st) => st.aTratar === chave);

  return (
    <View style={s.cartao}>
      <View style={s.linha}>
        <View style={{ opacity: 0.45 }}><Artwork track={comCatalogo(item.faixa)} size={40} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={s.titulo}>{tituloDaFaixa(item.faixa)}</Text>
          <Text numberOfLines={1} style={s.meta}>{motivoDaIndisponivel(item.motivo)}</Text>
        </View>
        {feito ? <Feito rotulo={feito} /> : item.copia === undefined ? (
          <Button secondary disabled={offline || aTratar} onPress={() => void procurarCopiaPara(item)}>
            {aTratar ? 'Searching…' : 'Find a copy'}
          </Button>
        ) : null}
      </View>
      {!feito && item.copia === null ? (
        <Text style={[s.meta, s.semCopia]}>No safe copy found. Try again later, or remove it yourself.</Text>
      ) : null}
      {!feito && item.copia ? (
        <>
          <View style={[s.linha, s.copia]}>
            <Artwork track={item.copia} size={40} />
            <Texto faixa={item.copia} />
          </View>
          <View style={s.acoes}>
            {emJam ? <Text style={[s.meta, { flex: 1 }]}>Listening is off during a Jam</Text> : <View style={{ flex: 1 }} />}
            {/* Ouvir antes de aceitar, no leitor normal. Num Jam não: tocar
                ali é sugerir à sala. */}
            <Button secondary icon="play" disabled={emJam || offline} onPress={() => play(item.copia!, [item.copia!])}>Listen</Button>
            <Button disabled={offline || aTratar} onPress={() => void substituirPelaCopia(item)}>Replace</Button>
          </View>
        </>
      ) : null}
      <ErroNaLinha chave={chave} recuo />
    </View>
  );
}

const s = StyleSheet.create({
  cabeca: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.lg,
    padding: ESP.lg, marginBottom: ESP.lg,
    borderRadius: RAIO.superficie, borderWidth: 1, borderColor: COR.linhaSuave, backgroundColor: COR.painel,
  },
  resumo: { ...TIPO.seccao, color: COR.texto },
  estado: { ...TIPO.corpo, color: COR.textoMedio },
  nota: { ...TIPO.legenda, color: COR.textoMedio },
  desfazer: {
    flexDirection: 'row', alignItems: 'center', gap: ESP.md,
    paddingHorizontal: ESP.lg, paddingVertical: ESP.sm, marginBottom: ESP.lg,
    borderRadius: RAIO.cartao, backgroundColor: COR.elevado,
  },
  seccao: { ...TIPO.micro, color: COR.textoFraco, marginTop: ESP.lg, marginBottom: ESP.sm },
  explicacao: { ...TIPO.legenda, color: COR.textoMedio, marginBottom: ESP.md, maxWidth: 640 },
  cartao: {
    marginBottom: ESP.md, borderRadius: RAIO.cartao, overflow: 'hidden',
    borderWidth: 1, borderColor: COR.linhaSuave, backgroundColor: COR.painel,
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: ESP.md, paddingHorizontal: ESP.md, paddingVertical: ESP.sm },
  linhaHover: { backgroundColor: COR.hover, cursor: 'pointer' } as any,
  copia: { borderTopWidth: 1, borderTopColor: COR.linhaSuave },
  acoes: { flexDirection: 'row', alignItems: 'center', gap: ESP.sm, paddingHorizontal: ESP.md, paddingBottom: ESP.md, paddingTop: ESP.xs },
  semCopia: { paddingHorizontal: ESP.md, paddingBottom: ESP.md },
  erroRecuado: { paddingHorizontal: ESP.md, paddingBottom: ESP.md },
  titulo: { ...TIPO.corpo, color: COR.texto, fontWeight: '500' as any },
  meta: { ...TIPO.legenda, color: COR.textoMedio },
  capa: { width: 40, height: 40, borderRadius: RAIO.ctrl, backgroundColor: COR.elevado },
  semCapa: { alignItems: 'center', justifyContent: 'center' },
  feito: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  vazio: { alignItems: 'center', gap: ESP.sm, marginTop: ESP.xxl },
});
