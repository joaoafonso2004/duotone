import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { MAXIMO_DA_CONTA, type ListaDoSpotify } from '../lib/bibliotecaDoSpotify';
import { abrirPeloLeitor, ErroDoLeitor, mensagemDoLeitor, type BibliotecaLida, type Consultar } from '../lib/leitorWebDoSpotify';
import { avisarErro, avisarFeito } from '../lib/avisoDeRemocao';
import { useImportacoes } from '../state/importacoes';
import { guardarGostoDaBiblioteca } from '../api/gostoDaBiblioteca';
import { Button, Dialog } from './ui.web';
import { COR, ESP, ESTADO, FONT, RAIO, TIPO } from './tokens.web';

/**
 * A conta do Spotify no PC (10/11): entra-se numa janela do próprio Spotify,
 * escolhe-se o que vem, e as listas vão para a fila de importações em segundo
 * plano -- o mesmo caminho do `ImportarDaContaDoSpotify` do iPhone. Sem
 * registo no painel do Spotify: a leitura é a do leitor web
 * (`electron/contaDoSpotify.cjs`, `lib/leitorWebDoSpotify.ts`).
 *
 * Só no Electron: fora dele (o `expo start --web`) não há ponte e o cartão
 * não aparece.
 */

const { createPortal } = require('react-dom') as { createPortal: (filho: React.ReactNode, onde: Element) => React.ReactElement };
const ponte = () => (typeof window !== 'undefined' ? window.duotoneDesktop : undefined);
const consultar: Consultar = (nome, variaveis) => ponte()!.consultarOSpotify!(nome, variaveis);
const musicas = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;

export function ContaDoSpotifyPc({ aoComecar }: { aoComecar: () => void }) {
  const temPonte = !!ponte()?.consultarOSpotify;
  const [ligada, setLigada] = useState<boolean | null>(null);
  const [aAbrir, setAAbrir] = useState(false);
  const [biblioteca, setBiblioteca] = useState<BibliotecaLida | null>(null);
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [aLer, setALer] = useState<string | null>(null);

  useEffect(() => {
    if (!temPonte) return;
    let vivo = true;
    void ponte()!.spotifyLigado!().then((l) => { if (vivo) setLigada(l); }, () => { if (vivo) setLigada(false); });
    return () => { vivo = false; };
  }, [temPonte]);

  if (!temPonte) return null;

  const abrir = async () => {
    setAAbrir(true);
    try {
      const b = await abrirPeloLeitor(consultar);
      setBiblioteca(b);
      setEscolhidas(new Set(b.listas.filter((l) => l.id === 'gostadas').map((l) => l.id)));
    } catch (e) {
      const tipo = e instanceof ErroDoLeitor ? e.tipo : 'rede';
      if (tipo === 'desligado') setLigada(false);
      avisarErro(mensagemDoLeitor(tipo));
    } finally {
      setAAbrir(false);
    }
  };

  const ligar = async () => {
    setAAbrir(true);
    let entrou = false;
    try {
      entrou = await ponte()!.entrarNoSpotify!();
    } catch {
      avisarErro("Couldn't open the Spotify login.");
    }
    setAAbrir(false);
    if (!entrou) return;
    setLigada(true);
    await abrir();
  };

  const desligar = async () => {
    await ponte()!.sairDoSpotify!().catch(() => {});
    setLigada(false);
    avisarFeito('Spotify disconnected', 'Duotone no longer keeps your Spotify login.');
  };

  const alternar = (id: string) => {
    const nova = new Set(escolhidas);
    if (nova.has(id)) nova.delete(id); else nova.add(id);
    setEscolhidas(nova);
  };

  const importar = async () => {
    if (!biblioteca || aLer) return;
    const listas = biblioteca.listas.filter((l) => escolhidas.has(l.id));
    const lidas: Parameters<ReturnType<typeof useImportacoes.getState>['importarDaConta']>[0] = [];
    let falhou = 0;
    let desligou = false;
    for (let i = 0; i < listas.length; i++) {
      setALer(`Reading ${i + 1} of ${listas.length}…`);
      try {
        const { linhas, cortada } = await biblioteca.ler(listas[i]);
        if (linhas.length) lidas.push({ nome: listas[i].nome, linhas, cortada, destino: listas[i].id === 'gostadas' ? 'gostadas' : 'playlist' });
      } catch (e) {
        // Uma lista que não se lê não trava as outras; um login caducado trava todas.
        if (e instanceof ErroDoLeitor && e.tipo === 'desligado') { desligou = true; break; }
        falhou++;
      }
    }
    setALer(null);
    setBiblioteca(null);
    if (desligou) { setLigada(false); avisarErro(mensagemDoLeitor('desligado')); return; }
    if (!lidas.length) { avisarErro("Couldn't read those lists from Spotify."); return; }
    useImportacoes.getState().importarDaConta(lidas);
    // O que se importa também dá o gosto às recomendações (11/11), como no iPhone.
    void guardarGostoDaBiblioteca(lidas.flatMap((l) => l.linhas)).catch(() => {});
    avisarFeito('Importing from Spotify',
      `${lidas.length} ${lidas.length === 1 ? 'list' : 'lists'} in the background${falhou ? ` · ${falhou} couldn't be read` : ''}`);
    aoComecar();
  };

  const listas = biblioteca?.listas ?? [];
  const todas = listas.length > 0 && escolhidas.size === listas.length;
  return (
    <View style={estilo.cartao}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.sm }}>
        <Image source={require('../../assets/spotify.png')} style={{ width: 18, height: 18 }} />
        <Text style={{ ...TIPO.seccao, color: COR.texto, flex: 1 }}>Your Spotify account</Text>
        {ligada ? <Text style={{ ...TIPO.micro, color: COR.textoFraco }}>Connected</Text> : null}
      </View>
      <Text style={estilo.nota}>
        {ligada
          ? `Choose your Liked Songs and playlists, all of them (up to ${MAXIMO_DA_CONTA} songs each).`
          : `Log in to Spotify and bring your Liked Songs and playlists, all of them (up to ${MAXIMO_DA_CONTA} songs each). Private playlists too.`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: ESP.md, marginTop: ESP.lg }}>
        {ligada ? (
          <>
            <Button icon="list-outline" ocupado={aAbrir} onPress={() => void abrir()}>{aAbrir ? 'Reading your library…' : 'Choose what to import'}</Button>
            <Button secondary disabled={aAbrir} onPress={() => void desligar()}>Disconnect</Button>
          </>
        ) : (
          <Button icon="log-in-outline" ocupado={aAbrir} disabled={ligada === null} onPress={() => void ligar()}>{aAbrir ? 'Waiting for Spotify…' : 'Connect Spotify'}</Button>
        )}
      </View>
      {/* O Google recusa entrar dentro de apps (11/11): diz-se antes, e não só quando falha. */}
      {!ligada ? (
        <Text style={[estilo.nota, { color: COR.textoFraco, marginTop: ESP.md }]}>
          Signed up with Google? Google doesn't allow signing in inside apps, so type your Gmail address and log in with the code Spotify emails you.
        </Text>
      ) : null}

      {/* Pelo portal, como o "Save queue" da fila: dentro do scroll da página o
          diálogo ficava preso ao cartão e cortado. Só existe aberto. */}
      {biblioteca ? createPortal(
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 310 } as any}>
      <Dialog open title="Choose what to import" width={520} onClose={() => { if (!aLer) setBiblioteca(null); }}>
        <Pressable accessibilityRole="button" onPress={() => setEscolhidas(todas ? new Set() : new Set(listas.map((l) => l.id)))}
          style={({ hovered }: any) => [{ alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 8, borderRadius: RAIO.ctrl, marginBottom: ESP.sm }, hovered && { backgroundColor: ESTADO.hover }]}>
          <Text style={{ ...TIPO.legenda, color: COR.texto, fontWeight: '600' }}>{todas ? 'Deselect all' : 'Select all'}</Text>
        </Pressable>
        <ScrollView style={{ maxHeight: 420 }}>
          {listas.map((l) => <Linha key={l.id} lista={l} escolhida={escolhidas.has(l.id)} aoPremir={() => alternar(l.id)} />)}
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: ESP.lg }}>
          <Button icon="download-outline" ocupado={!!aLer} disabled={escolhidas.size === 0} onPress={() => void importar()}>
            {aLer ?? `Import ${escolhidas.size}`}
          </Button>
        </View>
      </Dialog>
        </View>,
        document.body,
      ) : null}
    </View>
  );
}

function Linha({ lista: l, escolhida, aoPremir }: { lista: ListaDoSpotify; escolhida: boolean; aoPremir: () => void }) {
  const gostadas = l.id === 'gostadas';
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: escolhida }} onPress={aoPremir}
      style={({ hovered }: any) => [estilo.linha, hovered && { backgroundColor: COR.hover }]}>
      {gostadas
        ? <View style={[estilo.capa, { alignItems: 'center', justifyContent: 'center', backgroundColor: COR.metalSuave }]}><Ionicons name="heart" size={16} color={COR.texto} /></View>
        : l.capa ? <Image source={{ uri: l.capa }} style={estilo.capa} />
          : <View style={[estilo.capa, { alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="musical-notes" size={16} color={COR.textoFraco} /></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ ...TIPO.corpo, color: COR.texto, fontWeight: '600' }}>{l.nome}</Text>
        <Text numberOfLines={1} style={{ ...TIPO.legenda, color: COR.textoMedio }}>
          {musicas(l.total)}{gostadas ? ' · goes to your Liked Songs' : l.doutraPessoa ? ' · by someone else' : ''}
        </Text>
      </View>
      <View style={[estilo.caixa, escolhida && { backgroundColor: COR.texto, borderColor: COR.texto }]}>
        {escolhida ? <Ionicons name="checkmark" size={13} color={COR.fundo} /> : null}
      </View>
    </Pressable>
  );
}

const estilo = {
  cartao: { marginBottom: ESP.xl, padding: ESP.lg, borderRadius: RAIO.superficie, borderWidth: 1, borderColor: COR.linha, backgroundColor: 'rgba(233,234,238,0.03)' },
  nota: { ...TIPO.legenda, color: COR.textoMedio, lineHeight: 18, marginTop: ESP.sm, fontFamily: FONT.body },
  linha: { flexDirection: 'row', alignItems: 'center', gap: ESP.md, height: 54, paddingHorizontal: 10, borderRadius: RAIO.cartao, cursor: 'pointer' },
  capa: { width: 40, height: 40, borderRadius: RAIO.ctrl, backgroundColor: COR.elevado },
  caixa: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: COR.textoFraco, alignItems: 'center', justifyContent: 'center' },
} as any;
