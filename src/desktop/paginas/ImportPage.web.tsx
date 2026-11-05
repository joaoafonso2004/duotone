/**
 * Importar música de qualquer sítio (5/11, a maquete `docs/importar-maquete.html`).
 *
 * Uma caixa só: cola-se um link (Spotify, YouTube, Deezer, Apple Music) ou uma
 * lista de músicas, ou escolhe-se/larga-se um ficheiro (CSV, TXT, M3U), e a
 * app percebe o que é (`lib/entradaDaImportacao.ts`). Um link lê-se logo, para
 * o cartão dizer o nome e quantas; o botão manda tudo para a fila de
 * importações (`state/importacoes.ts`), que corre em segundo plano com a barra
 * na lateral. A conta do Spotify continua, numa linha discreta por baixo.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, Text, TextInput, View } from 'react-native';
import { fraseSemLeitura, NOME_DO_SERVICO, notaDoCorte } from '../../lib/entradaDaImportacao';
import type { Destino } from '../../lib/importacaoPorLink';
import { useImportacaoPreparada } from '../../hooks/useImportacaoPreparada';
import { useImportacoes } from '../../state/importacoes';
import { avisarInfo } from '../../lib/avisoDeRemocao';
import type { NavegarFn } from '../rotas';
import { BotaoVoltar, Button, Chips, ContentScroll, Page } from '../ui.web';
import { COR, ESP, ESTADO, FONT, RAIO, TIPO } from '../tokens.web';

const musicas = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;
const DESTINOS = [{ id: 'playlist', rotulo: 'New playlist' }, { id: 'gostadas', rotulo: 'Liked Songs' }] as const;
const ACEITES = '.csv,.txt,.m3u,.m3u8,text/csv,text/plain';
/** Um ficheiro de texto maior do que isto não é uma lista de músicas. */
const MAXIMO_DO_FICHEIRO = 5 * 1024 * 1024;

export function ImportPage({ back, navigate }: { back: () => void; notify: (s: string) => void; navigate: NavegarFn }) {
  const [texto, setTexto] = useState('');
  const [ficheiro, setFicheiro] = useState<{ nome: string; conteudo: string } | null>(null);
  const [destino, setDestino] = useState<Destino>('playlist');
  const [aLargar, setALargar] = useState(false);
  const [foco, setFoco] = useState(false);
  const escolher = useRef<HTMLInputElement | null>(null);
  const { entrada, leitura, aLer, erro } = useImportacaoPreparada(texto, ficheiro);

  const abrirFicheiro = async (f: File | null | undefined) => {
    if (!f) return;
    if (f.size > MAXIMO_DO_FICHEIRO) { setFicheiro({ nome: f.name, conteudo: '' }); return; }
    setTexto('');
    setFicheiro({ nome: f.name, conteudo: await f.text() });
  };

  // Largar um ficheiro em qualquer sítio da página. Sem o `preventDefault`, o
  // Electron abria o ficheiro na janela em vez da app.
  useEffect(() => {
    const temFicheiros = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const sobre = (e: DragEvent) => { if (!temFicheiros(e)) return; e.preventDefault(); setALargar(true); };
    const sai = (e: DragEvent) => { if (!e.relatedTarget) setALargar(false); };
    const larga = (e: DragEvent) => {
      if (!temFicheiros(e)) return;
      e.preventDefault();
      setALargar(false);
      void abrirFicheiro(e.dataTransfer?.files?.[0]);
    };
    window.addEventListener('dragover', sobre);
    window.addEventListener('dragleave', sai);
    window.addEventListener('drop', larga);
    return () => { window.removeEventListener('dragover', sobre); window.removeEventListener('dragleave', sai); window.removeEventListener('drop', larga); };
  }, []);

  const importar = () => {
    if (!leitura) return;
    useImportacoes.getState().importarLida(leitura, destino);
    avisarInfo('Importing in the background. You can keep listening.');
    back();
  };

  const servico = entrada.tipo === 'link' ? entrada.servico : null;
  const rotulo = entrada.tipo === 'link' ? `${NOME_DO_SERVICO[entrada.link.tipo]} playlist` : entrada.tipo === 'lista' ? (entrada.doFicheiro ? 'From a file' : 'From your text') : '';

  let cartao: React.ReactNode = null;
  if (entrada.tipo === 'sem-leitura') {
    const f = fraseSemLeitura(entrada.servico, true);
    cartao = <Cartao><Text style={estilo.nome}>{f.titulo}</Text><Text style={estilo.nota}>{f.corpo}</Text></Cartao>;
  } else if (entrada.tipo === 'link-desconhecido') {
    cartao = <Cartao><Text style={estilo.nome}>That link isn't a playlist we can read</Text><Text style={estilo.nota}>Check that the playlist is public, or paste the songs instead.</Text></Cartao>;
  } else if (entrada.tipo === 'nada') {
    cartao = <Cartao><Text style={estilo.nome}>{entrada.doFicheiro ? "Couldn't find any songs in that file" : "Couldn't find any songs in that text"}</Text><Text style={estilo.nota}>Write one song per line, like this: Artist - Song. A CSV needs a song and an artist column.</Text></Cartao>;
  } else if (entrada.tipo === 'link' && aLer) {
    cartao = <Cartao><Text style={estilo.micro}>{rotulo}</Text><Text style={[estilo.nota, { marginTop: ESP.xs }]}>Reading the playlist…</Text></Cartao>;
  } else if (entrada.tipo === 'link' && erro) {
    cartao = <Cartao><Text style={estilo.nome}>Couldn't read that playlist</Text><Text style={estilo.nota}>{erro}</Text></Cartao>;
  } else if (leitura && (entrada.tipo === 'link' || entrada.tipo === 'lista')) {
    const nota = notaDoCorte(servico ?? 'This list', leitura.cortada ? leitura.limite : null);
    const ignoradas = entrada.tipo === 'lista' ? entrada.lista.ignoradas : 0;
    const previa = entrada.tipo === 'lista' ? entrada.lista.linhas.slice(0, 3) : [];
    cartao = (
      <Cartao>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.md, minWidth: 0 }}>
          {leitura.capa
            ? <Image source={{ uri: leitura.capa }} style={estilo.capa} accessibilityIgnoresInvertColors />
            : <View style={[estilo.capa, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name={entrada.tipo === 'lista' ? 'list' : 'musical-notes'} size={20} color={COR.textoFraco} /></View>}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={estilo.micro}>{rotulo}</Text>
            <Text numberOfLines={1} style={estilo.nome}>{leitura.nome}</Text>
            <Text style={estilo.meta}>{musicas(leitura.total)}</Text>
          </View>
        </View>
        {previa.length ? <View style={{ marginTop: ESP.md, gap: 2 }}>{previa.map((l, i) => <Text key={i} numberOfLines={1} style={estilo.meta}>{l.artist} - {l.title}</Text>)}</View> : null}
        {ignoradas ? <Text style={estilo.nota}>{ignoradas === 1 ? '1 line' : `${ignoradas} lines`} skipped. Each line needs Artist - Song.</Text> : null}
        {nota ? <Text style={estilo.nota}>{nota}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: ESP.md, marginTop: ESP.lg }}>
          <Chips rotulo="Where the songs go" opcoes={DESTINOS} valor={destino} aoMudar={setDestino} />
          <View style={{ flex: 1 }} />
          <Button icon="download-outline" onPress={importar}>{`Import ${musicas(leitura.total)}`}</Button>
        </View>
      </Cartao>
    );
  }

  return (
    <Page title="Import music" subtitle="Bring a playlist from anywhere." action={<BotaoVoltar onPress={back} />}>
      <ContentScroll scrollKey="import">
        <View style={{ maxWidth: 720, paddingBottom: ESP.xxxl }}>
          {ficheiro ? (
            <View style={[estilo.caixa, { minHeight: 0, flexDirection: 'row', alignItems: 'center', gap: ESP.md }]}>
              <Ionicons name="document-text-outline" size={18} color={COR.textoMedio} />
              <Text numberOfLines={1} style={{ ...TIPO.corpo, color: COR.texto, flex: 1 }}>{ficheiro.nome}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove the file" onPress={() => setFicheiro(null)} hitSlop={8}
                style={({ hovered }: any) => [{ padding: 4, borderRadius: RAIO.ctrl }, hovered && { backgroundColor: ESTADO.hover }]}>
                <Ionicons name="close" size={16} color={COR.textoMedio} />
              </Pressable>
            </View>
          ) : (
            <TextInput
              multiline
              value={texto}
              onChangeText={setTexto}
              onFocus={() => setFoco(true)}
              onBlur={() => setFoco(false)}
              placeholder="Paste a playlist link or a list of songs"
              placeholderTextColor={COR.textoFraco}
              accessibilityLabel="Playlist link or list of songs"
              style={[estilo.caixa, (foco || aLargar) && { borderColor: 'rgba(233,234,238,0.28)' }, { outlineStyle: 'none' } as any]}
            />
          )}
          <Text style={estilo.dica}>Spotify, YouTube, Deezer and Apple Music links. For anything else, one song per line: Artist - Song.</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.md, flexWrap: 'wrap' }}>
            <Button secondary icon="document-outline" onPress={() => escolher.current?.click()}>Choose a file</Button>
            <Text style={{ ...TIPO.legenda, color: aLargar ? COR.texto : COR.textoFraco }}>{aLargar ? 'Drop it to import' : 'CSV, TXT or M3U · or drop it here'}</Text>
            <input ref={escolher} type="file" accept={ACEITES} style={{ display: 'none' }}
              onChange={(e) => { void abrirFicheiro(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />
          </View>
          {cartao}
          <Pressable accessibilityRole="link" onPress={() => navigate({ name: 'spotify-import' })}
            style={({ hovered }: any) => [{ alignSelf: 'flex-start', marginTop: ESP.xxl, flexDirection: 'row', alignItems: 'center', gap: ESP.sm, paddingVertical: 6, paddingHorizontal: 8, marginLeft: -8, borderRadius: RAIO.ctrl }, hovered && { backgroundColor: ESTADO.hover }]}>
            <Ionicons name="person-circle-outline" size={16} color={COR.textoMedio} />
            <Text style={{ ...TIPO.legenda, color: COR.textoMedio }}>Import from your Spotify account or a Spotify export instead</Text>
          </Pressable>
        </View>
      </ContentScroll>
    </Page>
  );
}

function Cartao({ children }: { children: React.ReactNode }) {
  return <View style={estilo.cartao}>{children}</View>;
}

const estilo = {
  caixa: { minHeight: 112, paddingVertical: 13, paddingHorizontal: 14, borderRadius: RAIO.cartao, borderWidth: 1, borderColor: COR.linha, backgroundColor: COR.elevado, color: COR.texto, fontFamily: FONT.body, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' },
  dica: { ...TIPO.legenda, color: COR.textoFraco, marginTop: ESP.sm, marginBottom: ESP.md },
  cartao: { marginTop: ESP.lg, padding: ESP.lg, borderRadius: RAIO.superficie, borderWidth: 1, borderColor: COR.linha, backgroundColor: 'rgba(233,234,238,0.03)' },
  capa: { width: 52, height: 52, borderRadius: RAIO.ctrl, backgroundColor: COR.elevado },
  micro: { ...TIPO.micro, color: COR.textoFraco },
  nome: { fontFamily: FONT.display, fontSize: 16, fontWeight: '600', color: COR.texto, marginTop: 2 },
  meta: { ...TIPO.legenda, color: COR.textoMedio },
  nota: { ...TIPO.legenda, color: COR.textoMedio, lineHeight: 18, marginTop: ESP.sm },
} as any;
