import React from 'react';
import { StyleSheet, View } from 'react-native';

/** A reprodução e as ferramentas partilham os mesmos cinco eixos. */
export function PlayerControlRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      {React.Children.map(children, (child, index) => (
        <View style={[
          styles.slot,
          index === 0 || index === 4 ? styles.edge : index === 2 ? styles.center : styles.inner,
        ]}>
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', flexDirection: 'row', alignItems: 'center' },
  slot: { alignItems: 'center', justifyContent: 'center' },
  edge: { width: 44 },
  center: { width: 64 },
  inner: { flex: 1, minWidth: 44 },
});
