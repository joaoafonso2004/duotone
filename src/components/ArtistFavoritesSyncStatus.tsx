import React from 'react';
import { Pressable, Text } from 'react-native';
import { useArtistasFavoritos } from '../state/artistasFavoritos';

export function ArtistFavoritesSyncStatus() {
  const estado = useArtistasFavoritos(s => s.estado);
  if (estado !== 'error' && estado !== 'pending') return null;
  return <Pressable accessibilityRole="button" onPress={() => void useArtistasFavoritos.getState().carregar()}
    style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
    <Text style={{ color: '#C6C6D0', fontSize: 12 }}>{estado === 'error'
      ? 'Artist favourites waiting to sync. Tap to retry.' : 'Syncing artist favourites…'}</Text>
  </Pressable>;
}
