# Duotone desktop architecture

## Audit findings

The starting repository was an Expo/React Native mobile application only. It had no Electron main process, preload bridge, web dependencies, web build target, desktop entry point, or platform-specific components.

Mobile assumptions were present throughout the UI: bottom-tab navigation, safe-area-derived spacing, portrait-first fixed paddings, bottom sheets, touch hit-slop, haptics, native alerts, swipe/pan player controls, a full-screen now-playing overlay, and list padding calculated from a mobile tab bar. Hover, focus-visible states, right-click menus, keyboard navigation, title-bar drag regions, minimum window sizes, and wide layouts were absent.

## Boundary

- `App.tsx` and existing unsuffixed screens/components remain the native mobile application.
- `RootNavigator.web.tsx` is the desktop renderer entry selected by Expo's platform resolver.
- `src/desktop/**` contains desktop-only renderer UI and contracts.
- `electron/main.cjs` owns the BrowserWindow and OS lifecycle only.
- `electron/preload.cjs` exposes a small, typed IPC capability surface. The renderer has no Node access.
- Existing Supabase APIs, Zustand stores, domain types, and preferences remain shared.
- Account profile preferences and play statistics use Supabase as their shared source of truth. AsyncStorage is an offline cache and pending-write queue, including a one-time migration of pre-sync mobile data.

## Desktop information architecture

The renderer uses a persistent navigation rail, a draggable custom title bar, one resizable content region, and a persistent bottom player. Top-level destinations are Search, Songs, Artists, Playlists, Profile, and Settings. Album, artist, playlist, and import views are content routes rather than nested mobile stacks.

The shell owns keyboard shortcuts and history. Screens own data loading and mutations. Reusable desktop components provide page headers, tables, cards, dialogs, empty/loading states, and context actions.

## Security and Electron policy

The BrowserWindow uses `contextIsolation`, `sandbox`, and `nodeIntegration: false`. Navigation outside the application is blocked and handed to the OS browser. IPC channel handlers are fixed and payloads are constrained. UI state and business rules never live in Electron.

Production assets are served through the privileged `duotone://app` protocol. Requests are normalized and constrained to the exported web root, which lets Expo's root-relative bundles and fonts work without weakening navigation policy or starting a local HTTP server.

## Delivery phases

1. Establish a working web/Electron toolchain and secure preload contract.
2. Add the frameless desktop shell, sidebar, title bar, routing, shortcuts, and player surface.
3. Replace mobile list/sheet patterns with desktop tables, cards, dialogs, contextual actions, and wide detail layouts.
4. Verify type checking, Expo web export, Electron launch, window resizing, keyboard/focus behavior, and packaging.
