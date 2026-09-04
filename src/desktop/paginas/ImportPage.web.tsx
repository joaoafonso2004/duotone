/**
 * Importar uma playlist do YouTube por URL.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fetchYouTubePlaylist } from '../../api/youtube';
import { addTracksToPlaylist, createPlaylist, listPlaylists } from '../../api/playlists';
import { useTheme } from '../../state/theme';
import type { Playlist } from '../../types';
import { styles } from '../estilos.web';
import { Button, ContentScroll, desktop, Field, Page } from '../ui.web';

export function ImportPage({ back, notify }: { back: () => void; notify: (s: string) => void }) {
  const [url, setUrl] = useState(''); const [loading, setLoading] = useState(false); const [preview, setPreview] = useState<any>(null); const [playlists, setPlaylists] = useState<Playlist[]>([]); const [target, setTarget] = useState<string>('');
  const [newPlName, setNewPlName] = useState(''); const [creatingNew, setCreatingNew] = useState(false);
  const theme = useTheme((s) => s.theme);
  const refreshPlaylists = () => { listPlaylists().then((p) => { setPlaylists(p); if (p.length && !target) setTarget(p[0].id); }); };
  useEffect(() => { refreshPlaylists(); }, []);
  const inspect = async () => { setLoading(true); try { setPreview(await fetchYouTubePlaylist(url)); } catch (e: any) { notify(e?.message || 'Could not read playlist.'); } finally { setLoading(false); } };
  const runImport = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      let finalTarget = target;
      if (creatingNew && newPlName.trim()) {
        const newPl = await createPlaylist(newPlName.trim());
        finalTarget = newPl.id;
      }
      if (!finalTarget) throw new Error('Please select or create a destination playlist.');
      await addTracksToPlaylist(finalTarget, preview.items.map((x: any) => ({ source: 'youtube', sourceId: x.videoId, title: x.title, artist: x.channel || null, album: null, artworkUrl: x.thumbnail, durationSeconds: null })));
      notify(`Imported ${preview.items.length} tracks.`);
      back();
    } catch (e: any) {
      notify(e?.message || 'Import failed.');
    } finally {
      setLoading(false);
    }
  };
  return <Page title="Import from YouTube" subtitle="Bring an existing playlist into your Duotone collection." action={<Button secondary icon="arrow-back" onPress={back}>Playlists</Button>}><ContentScroll><View style={styles.importPanel}><Text style={styles.formLabel}>YOUTUBE PLAYLIST URL</Text><View style={styles.searchBar}><Field icon="logo-youtube" placeholder="https://youtube.com/playlist?list=…" value={url} onChangeText={setUrl} onSubmitEditing={inspect} /><Button onPress={inspect} disabled={loading}>Preview</Button></View>{preview && <><View style={styles.importSummary}><View><Text style={styles.sectionTitle}>{preview.title}</Text><Text style={styles.cardMeta}>{preview.items.length} available tracks</Text></View></View><Text style={styles.formLabel}>DESTINATION</Text><View style={styles.destinationGrid}><Pressable onPress={() => setCreatingNew(false)} style={[styles.destination, !creatingNew && { backgroundColor: theme.soft, borderColor: theme.color }]}><Ionicons name={!creatingNew ? 'radio-button-on' : 'radio-button-off'} color={!creatingNew ? theme.color : desktop.dim} size={18} /><Text style={styles.destinationText}>Select existing playlist:</Text></Pressable>{!creatingNew && playlists.map((p) => <Pressable key={p.id} onPress={() => setTarget(p.id)} style={[styles.destination, target === p.id && { marginLeft: 16, borderColor: theme.color }]}><Ionicons name={target === p.id ? 'checkmark-circle' : 'ellipse-outline'} color={target === p.id ? theme.color : desktop.dim} size={16} /><Text style={styles.destinationText}>{p.name}</Text></Pressable>)}<Pressable onPress={() => setCreatingNew(true)} style={[styles.destination, creatingNew && { backgroundColor: theme.soft, borderColor: theme.color }]}><Ionicons name={creatingNew ? 'radio-button-on' : 'radio-button-off'} color={creatingNew ? theme.color : desktop.dim} size={18} /><Text style={styles.destinationText}>Or create a new playlist:</Text></Pressable>{creatingNew && <View style={{ marginLeft: 16, marginTop: 4, width: '100%', maxWidth: 400 }}><Field placeholder="New playlist name" value={newPlName} onChangeText={setNewPlName} /></View>}</View><View style={styles.dialogActions}><Button onPress={runImport} disabled={loading || (creatingNew && !newPlName.trim()) || (!creatingNew && !target)}>Import {preview.items.length} tracks</Button></View></>}</View></ContentScroll></Page>;
}
