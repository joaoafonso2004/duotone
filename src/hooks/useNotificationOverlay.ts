import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { registerNotificationOverlay } from '../lib/notificationOverlays';

/** Return as Modal.onDismiss. Closing via a banner must not stack native modals. */
export function useNotificationOverlay(visible: boolean, onClose: () => void) {
  const close = useRef(onClose); close.current=onClose;
  const release = useRef<(() => void) | null>(null);
  const dismiss = () => { release.current?.(); release.current=null; };
  useEffect(() => {
    if (visible && !release.current) release.current=registerNotificationOverlay(() => close.current());
    if (!visible && Platform.OS !== 'ios') { release.current?.(); release.current=null; }
  }, [visible]);
  useEffect(() => () => { release.current?.(); release.current=null; }, []);
  return dismiss;
}
