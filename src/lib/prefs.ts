import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_DEFAULT_SEARCH_TAB = 'pref:defaultSearchTab';

export type SearchSource = 'youtube' | 'spotify';

export async function getDefaultSearchTab(): Promise<SearchSource> {
  const v = await AsyncStorage.getItem(KEY_DEFAULT_SEARCH_TAB);
  return v === 'spotify' ? 'spotify' : 'youtube';
}

export async function setDefaultSearchTab(v: SearchSource): Promise<void> {
  await AsyncStorage.setItem(KEY_DEFAULT_SEARCH_TAB, v);
}
