import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { addTracksToPlaylist, createPlaylist, deletePlaylist, listPlaylists } from '../api/playlists';
import { searchYouTubeFreeWithChannel } from '../api/ytSearchFree';
import { parseSpotifyCsv, type SpotifyCsvRow } from '../lib/spotifyCsv';
import {
  confidentTracks,
  importSpotifyCsv,
  missingResults,
  uncertainResults,
  type ImportedTrack,
  type ImportProgress,
} from '../lib/spotifyImport';
import type { Playlist, Track } from '../types';
import { SpotifyReview } from './SpotifyReview.web';
import { Button, ContentScroll, desktop, Field, Page } from './ui.web';

/**
 * Importação de playlists do Spotify — só no desktop.
 *
 * O Spotify não dá áudio pela API, por isso o que se importa é a LISTA: cada
 * faixa é depois procurada no YouTube, que já é a fonte de áudio da app.
 *
 * Só existe no PC por dois motivos. O seletor de ficheiros é grátis aqui
 * (é um `<input type="file">` do browser dentro do Electron), enquanto no
 * telemóvel exigiria uma dependência nativa e recompilar as duas apps. E mil
 * faixas demoram minutos de pesquisa — o sítio para isso é o computador,
 * não o telemóvel a gastar bateria. A biblioteca vive no Supabase, portanto
 * o resultado aparece no iPhone sozinho.
 */

type Phase = 'idle' | 'parsed' | 'running' | 'done';

export function SpotifyImportPage({ back, notify }: { back: () => void; notify: (m: string) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<SpotifyCsvRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [results, setResults] = useState<ImportedTrack[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(true);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  // Progresso da gravacao. Numa playlist de 2000 faixas isto demora, e sem
  // sinal nenhum o utilizador fica a olhar para um botao a achar que travou.
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const dropZone = useRef<View | null>(null);
  const abort = useRef<AbortController | null>(null);
  // Guarda o que já foi resolvido: cancelar e recomeçar não repete a rede.
  const resolved = useRef(new Map<string, ImportedTrack>());

  useEffect(() => {
    listPlaylists().then(setPlaylists).catch(() => {});
    return () => abort.current?.abort();
  }, []);

  /** Um só caminho para o ficheiro, venha do seletor ou de ser largado. */
  async function acceptFile(file: File) {
    if (!/\.csv$/i.test(file.name)) {
      setError(`"${file.name}" não é um CSV. Exporta a playlist no Exportify.`);
      return;
    }

    const parsed = parseSpotifyCsv(await file.text());

    if (parsed.problem === 'empty') {
      setError('O ficheiro está vazio.');
      return;
    }
    if (parsed.problem === 'unrecognised-columns') {
      setError(
        'Não reconheci as colunas. Confirma que é um CSV exportado do Exportify — ' +
          `encontrei: ${parsed.headers.slice(0, 4).join(', ')}…`
      );
      return;
    }
    if (!parsed.rows.length) {
      setError('O ficheiro não tem faixas.');
      return;
    }

    setError(null);
    setFileName(file.name);
    setRows(parsed.rows);
    setNewName(file.name.replace(/\.csv$/i, ''));
    setResults([]);
    setProgress(null);
    setReviewing(false);
    resolved.current.clear();
    setPhase('parsed');
  }

  function pickFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void acceptFile(file);
    };
    input.click();
  }

  /**
   * Arrastar e largar.
   *
   * Os eventos de arrasto não passam pelo `View` do react-native-web, por
   * isso liga-se ao nó do DOM diretamente. Como este ficheiro é `.web.tsx`,
   * só existe no desktop e nunca chega ao telemóvel.
   *
   * O `dragenter`/`dragleave` são contados: os filhos disparam os seus, e
   * sem contador a moldura pisca sempre que o cursor passa por cima de um
   * elemento interior.
   */
  useEffect(() => {
    const node: HTMLElement | null = dropZone.current as any;
    if (!node) return;

    let depth = 0;
    const stop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const onEnter = (e: DragEvent) => {
      stop(e);
      depth++;
      if (phase !== 'running') setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      stop(e);
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      stop(e);
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      stop(e);
      depth = 0;
      setDragging(false);
      if (phase === 'running') return;
      const file = e.dataTransfer?.files?.[0];
      if (file) void acceptFile(file);
    };

    node.addEventListener('dragenter', onEnter);
    node.addEventListener('dragover', onOver);
    node.addEventListener('dragleave', onLeave);
    node.addEventListener('drop', onDrop);
    return () => {
      node.removeEventListener('dragenter', onEnter);
      node.removeEventListener('dragover', onOver);
      node.removeEventListener('dragleave', onLeave);
      node.removeEventListener('drop', onDrop);
    };
  }, [phase]);

  /**
   * O browser abre um ficheiro largado fora da zona, substituindo a app.
   * Perder uma importação a meio por causa disso seria irrecuperável.
   */
  useEffect(() => {
    const block = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, []);

  async function run() {
    abort.current = new AbortController();
    setPhase('running');
    setProgress({ done: 0, total: rows.length, current: '', confident: 0, uncertain: 0, missing: 0 });

    const found = await importSpotifyCsv({
      rows,
      signal: abort.current.signal,
      resumeFrom: resolved.current,
      search: searchYouTubeFreeWithChannel,
      onProgress: setProgress,
    });

    for (const item of found) {
      if (item.row.uri) resolved.current.set(item.row.uri, item);
    }
    setResults(found);
    setPhase('done');
  }

  async function save(tracks: Track[]) {
    if (!tracks.length) {
      notify('Não há faixas para guardar.');
      return;
    }

    setSaving(true);
    setSaveProgress({ done: 0, total: tracks.length });
    // Guardado para poder desfazer: se a insercao falhar numa playlist que
    // acabamos de criar, o utilizador ficava com um esqueleto vazio na
    // biblioteca (foi exatamente o que aconteceu numa importacao de 2000).
    let criadaAgora: string | null = null;
    let inseridas = 0;
    try {
      if (creatingNew) {
        criadaAgora = (await createPlaylist(newName.trim() || fileName)).id;
      }
      const id = criadaAgora ?? target!;
      await addTracksToPlaylist(id, tracks, (done, total) => {
        inseridas = done;
        setSaveProgress({ done, total });
      });
      notify(`${tracks.length} ${tracks.length === 1 ? 'faixa adicionada' : 'faixas adicionadas'}.`);
      back();
    } catch (e: any) {
      if (criadaAgora && inseridas === 0) {
        // Nada entrou: apagar em vez de deixar lixo na biblioteca.
        await deletePlaylist(criadaAgora).catch(() => {});
        notify(e?.message ?? 'Não foi possível guardar. A playlist nao foi criada.');
      } else if (criadaAgora) {
        notify(`Guardadas ${inseridas} de ${tracks.length} faixas antes de falhar.`);
      } else {
        notify(e?.message ?? 'Não foi possível guardar.');
      }
    } finally {
      setSaving(false);
      setSaveProgress(null);
    }
  }

  const uncertain = uncertainResults(results);
  const missing = missingResults(results);
  const ratio = progress && progress.total ? progress.done / progress.total : 0;
  // Sem destino escolhido não há onde guardar, e vale para todos os botões.
  const destinationMissing = creatingNew ? !newName.trim() : !target;

  return (
    <Page
      title="Importar do Spotify"
      subtitle="Exporta as tuas playlists no Exportify e traz a lista para o Duotone."
      action={
        <Button secondary icon="arrow-back" onPress={back}>
          Playlists
        </Button>
      }
    >
      <ContentScroll>
        <View style={s.panel}>
          {/* Como obter o ficheiro */}
          <View style={s.hint}>
            <Image source={require('../../assets/spotify.png')} style={s.brand} />
            <Text style={s.hintText}>
              Abre <Text style={s.strong}>watsonbox.github.io/exportify</Text>, entra com a tua conta
              Spotify e descarrega o CSV da playlist. O áudio vem do YouTube — o Spotify não o
              disponibiliza —, por isso alguma faixa pode sair trocada.
            </Text>
          </View>

          <Text style={s.label}>FICHEIRO CSV</Text>

          {/* Zona de largar */}
          <View
            ref={dropZone}
            style={[s.drop, dragging && { borderColor: desktop.accent, backgroundColor: desktop.accentSoft }]}
          >
            <Ionicons
              name={dragging ? 'download-outline' : 'document-outline'}
              size={22}
              color={dragging ? desktop.accent : desktop.dim}
            />
            <Text style={s.dropText}>
              {dragging
                ? 'Larga aqui'
                : fileName
                  ? fileName
                  : 'Arrasta o CSV para aqui, ou escolhe o ficheiro'}
            </Text>
            <View style={s.row}>
              <Button icon="folder-open-outline" onPress={pickFile} disabled={phase === 'running'}>
                Escolher ficheiro…
              </Button>
              {phase !== 'idle' && !!rows.length && (
                <Text style={s.meta}>
                  {rows.length} {rows.length === 1 ? 'faixa' : 'faixas'}
                </Text>
              )}
            </View>
          </View>

          {error && <Text style={s.error}>{error}</Text>}

          {phase === 'parsed' && (
            <View style={s.actions}>
              <Button onPress={run}>Procurar {rows.length} faixas no YouTube</Button>
            </View>
          )}

          {/* Progresso da GRAVACAO (depois da revisao manual). Sem isto, numa
              playlist grande ficava um botao desativado e mais nada — e o
              utilizador nao sabia se estava a trabalhar ou preso. */}
          {saving && saveProgress && (
            <View style={s.block}>
              <View style={s.track}>
                <View
                  style={[
                    s.fill,
                    {
                      width: `${
                        saveProgress.total
                          ? Math.round((saveProgress.done / saveProgress.total) * 100)
                          : 0
                      }%`,
                    },
                  ]}
                />
              </View>
              <Text style={s.meta}>
                A guardar {saveProgress.done} de {saveProgress.total} faixas...
              </Text>
            </View>
          )}

          {/* Progresso */}
          {phase === 'running' && progress && (
            <View style={s.block}>
              <View style={s.track}>
                <View style={[s.fill, { width: `${Math.round(ratio * 100)}%` }]} />
              </View>
              <Text style={s.meta}>
                {progress.done} de {progress.total} · {progress.confident} automáticas ·{' '}
                {progress.uncertain} a confirmar · {progress.missing} sem resultado
              </Text>
              <Text numberOfLines={1} style={s.current}>
                {progress.current}
              </Text>
              <View style={s.actions}>
                <Button secondary onPress={() => abort.current?.abort()}>
                  Parar
                </Button>
              </View>
            </View>
          )}

          {/* Resultado */}
          {phase === 'done' && (
            <View style={s.block}>
              <View style={s.summary}>
                <Stat value={confidentTracks(results).length} label="prontas" tone={desktop.accent} />
                <Stat value={uncertain.length} label="a confirmar" tone={desktop.muted} />
                <Stat value={missing.length} label="sem resultado" tone={desktop.danger} />
              </View>

              {!!missing.length && (
                <View style={s.list}>
                  <Text style={s.label}>NÃO ENCONTRADAS</Text>
                  {missing.slice(0, 8).map((m, i) => (
                    <Text key={i} numberOfLines={1} style={s.listItem}>
                      {m.row.artist} — {m.row.title}
                    </Text>
                  ))}
                  {missing.length > 8 && <Text style={s.meta}>e mais {missing.length - 8}.</Text>}
                </View>
              )}

              <Text style={s.label}>DESTINO</Text>
              <View style={s.dest}>
                <Choice
                  selected={creatingNew}
                  label="Criar uma playlist nova:"
                  onPress={() => setCreatingNew(true)}
                />
                {creatingNew && (
                  <View style={s.indent}>
                    <Field placeholder="Nome da playlist" value={newName} onChangeText={setNewName} />
                  </View>
                )}
                <Choice
                  selected={!creatingNew}
                  label="Adicionar a uma existente:"
                  onPress={() => setCreatingNew(false)}
                />
                {!creatingNew &&
                  playlists.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => setTarget(p.id)}
                      style={[s.choice, s.indent, target === p.id && { borderColor: desktop.accent }]}
                    >
                      <Ionicons
                        name={target === p.id ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={target === p.id ? desktop.accent : desktop.dim}
                      />
                      <Text style={s.choiceText}>{p.name}</Text>
                    </Pressable>
                  ))}
              </View>

              <View style={s.actions}>
                <Button
                  onPress={() => save(confidentTracks(results))}
                  disabled={destinationMissing || saving}
                >
                  Adicionar {confidentTracks(results).length} prontas
                </Button>
                {!!uncertain.length && (
                  <>
                    <Button
                      secondary
                      icon="checkmark-done-outline"
                      onPress={() => setReviewing(true)}
                      disabled={destinationMissing || saving}
                    >
                      Rever {uncertain.length}
                    </Button>
                    <Button
                      secondary
                      onPress={() => save(results.filter((r) => r.track).map((r) => r.track!))}
                      disabled={destinationMissing || saving}
                    >
                      Adicionar todas ({confidentTracks(results).length + uncertain.length})
                    </Button>
                  </>
                )}
              </View>
              {!!uncertain.length && (
                <Text style={s.meta}>
                  As {uncertain.length} a confirmar foram encontradas mas com menos certeza. Rever
                  mostra as alternativas uma a uma; adicionar todas aceita as sugestões e deixa a
                  correção para depois.
                </Text>
              )}

              {/* Revisão faixa a faixa das duvidosas */}
              {reviewing && (
                <View style={{ marginTop: 12 }}>
                  <SpotifyReview
                    items={uncertain}
                    onCancel={() => setReviewing(false)}
                    onDone={(chosen) => save([...confidentTracks(results), ...chosen])}
                  />
                </View>
              )}
            </View>
          )}
        </View>
      </ContentScroll>
    </Page>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, { color: tone }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function Choice({
  selected,
  label,
  onPress,
}: {
  selected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.choice, selected && { backgroundColor: desktop.accentSoft, borderColor: desktop.accent }]}
    >
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={18}
        color={selected ? desktop.accent : desktop.dim}
      />
      <Text style={s.choiceText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  panel: { padding: 24, gap: 14, backgroundColor: desktop.panel, borderRadius: 14, borderWidth: 1, borderColor: desktop.border },
  hint: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 10, backgroundColor: desktop.accentSoft },
  brand: { width: 18, height: 18, marginTop: 1 },
  drop: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 26, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: desktop.border, backgroundColor: desktop.bg },
  dropText: { color: desktop.muted, fontSize: 13 },
  hintText: { flex: 1, color: desktop.muted, fontSize: 13, lineHeight: 19 },
  strong: { color: desktop.text, fontWeight: '600' },
  label: { color: desktop.dim, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  meta: { color: desktop.muted, fontSize: 12 },
  current: { color: desktop.dim, fontSize: 12 },
  error: { color: desktop.danger, fontSize: 13, lineHeight: 19 },
  block: { gap: 10, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  track: { height: 6, borderRadius: 3, backgroundColor: desktop.raised, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: desktop.accent },
  summary: { flexDirection: 'row', gap: 28, paddingVertical: 8 },
  stat: { gap: 2 },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { color: desktop.dim, fontSize: 11, letterSpacing: 0.6 },
  list: { gap: 4, padding: 12, borderRadius: 10, backgroundColor: desktop.raised },
  listItem: { color: desktop.muted, fontSize: 12 },
  dest: { gap: 8 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: desktop.border },
  choiceText: { color: desktop.text, fontSize: 13 },
  indent: { marginLeft: 20, maxWidth: 420 },
});
