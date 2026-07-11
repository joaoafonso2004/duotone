# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Duotone: app de música pessoal para iOS (React Native + Expo SDK 57, CNG/prebuild, TypeScript). Toca faixas do YouTube num player nativo (background + lock screen) e integra Spotify via Connect API. Backend: Supabase (Postgres + Auth + RLS). **Uso pessoal, nunca vai à App Store** — é essa a justificação para extrair streams do YouTube via InnerTube. Atenção: o README.md descreve a arquitetura original (player oficial embed, sem extração) e **fica assim de propósito — NÃO o atualizar nem "corrigir"**; a realidade do código é a extração via InnerTube com o embed como fallback final, e a fonte de verdade sobre o player é este ficheiro + os comentários em YouTubePlayerView.tsx/ytstream.ts.

Código e comentários em português (PT-PT). UI mistura PT e EN.

## Comandos

```powershell
npm install            # primeira vez
npm run typecheck      # tsc --noEmit — correr antes de considerar qualquer mudança terminada
npm test               # testes do mp4Fixer (Node puro, sem jest): node scripts/test-mp4fixer.mjs
npx expo start         # dev server (Expo Go NÃO suporta: expo-video lock screen, módulo nativo, Spotify)
npx expo prebuild      # regenera ios/ — OBRIGATÓRIO após mexer em modules/ (módulos nativos locais)
npm run ios            # build + run local (precisa de Mac/Xcode; o dev trabalha em Windows → usa EAS)
```

Builds reais via EAS (ver GUIA-IPA-GRATIS.md). CI (.github/workflows/ci.yml) corre typecheck + test. Só existe um ficheiro de teste; novos testes de lógica pura seguem o mesmo padrão (script Node em `scripts/`, sem framework).

## Arquitetura — o pipeline de reprodução (o coração da app)

Fluxo: ecrãs → `usePlayer` (zustand, `src/state/player.ts`) → `PlayerRoot` (overlay sempre montado com mini-player) → `YouTubePlayerView` (motor).

- **`YouTubePlayerView.tsx`** — cascata de 3 fases documentada no topo do ficheiro: (1) harvest via WebView invisível (atualmente bypassed — o efeito chama `proceedRef.current(null, ...)` direto), (2) resolver próprio InnerTube (`api/ytstream.ts`), (3) embed WebView oficial (último recurso; não toca em background). Áudio mp4 progressivo é SEMPRE descarregado por chunks para ficheiro local antes de ir ao AVPlayer (`expo-video`) — entregar o URL remoto diretamente falha. Tem watchdog (posição presa >6s → fallback para download), tokens por faixa (`runIdRef`) para abortar cadeias async obsoletas, e fade in/out.
- **`api/ytstream.ts`** — clientes InnerTube em cascata: ANDROID_VR (sem PO Token, sem limite) → ANDROID → IOS+PO Token. **Limitação confirmada**: sem PO Token, o cliente IOS só dá ~1MB cumulativo por vídeo/IP (20-30s de áudio). Servidor PO Token opcional nas Definições (GUIA-POT-TOKEN.md). Se um cliente parar de resolver (HTTP 400), atualizar o `clientVersion`.
- **`lib/youtubeCache.ts`** — cache local de áudio por videoId + downloads offline explícitos + pruning LRU (500MB, **só no arranque** — pruning durante reprodução já causou crashes). `CACHE_VERSION`: incrementar sempre que o mp4Fixer mudar (invalida cache no arranque).
- **`lib/mp4Fixer.ts`** — CRÍTICO e não-óbvio: o m4a do YouTube é fMP4 com a duração total declarada no moov **e** nos fragmentos; o AVPlayer soma as duas e o lock screen mostrava 2x. O fixer zera mvhd/tkhd/mdhd (layout CMAF canónico) e neutraliza sidx/edts. NÃO reintroduzir "corrigir" os cabeçalhos com a duração real — dá 2x (histórico completo nos comentários e em `scripts/test-mp4fixer.mjs`).
- **Lock screen**: alimentado exclusivamente pelo expo-video com `AVPlayerItem.duration` — não há API JS para sobrepor a duração. Botões next/prev vêm do módulo nativo local **`modules/duotone-remote-commands`** (MPRemoteCommandCenter → eventos JS → fila do store); degrada para no-op se o binário não o incluir.
- **Estado persistido**: o store do player persiste sessão (`player-session` no AsyncStorage, debounced 3s) — no arranque restaura fila/faixa/posição PAUSADA (`autoplayOnLoad=false`, `resumePositionMs`). Preferências vivem em `lib/prefs.ts` (AsyncStorage separado, com cache síncrono para hot paths).
- **Sleep timer**: deadline absoluto (`sleepTimerEndsAt`) verificado no `timeUpdate` do player nativo — nunca reverter para contador com `setInterval` (o iOS suspende timers JS em background).
- Duração/posição na UI: sempre `track.durationSeconds` (fiável), nunca `player.duration` exceto como último fallback.

## Supabase

- Migrações = ficheiros SQL em `supabase/`, corridos **manualmente** no SQL Editor (schema.sql base + incrementais: social-setup, inbox-archive, etc.). Não há tooling de migração — ao criar uma feature nova com SQL, adicionar um ficheiro incremental e avisar o utilizador para o correr.
- **`shared_items` serve inbox E conversas de chat.** Remover da inbox = `archived_at` (archiveInboxItem), NUNCA delete — um DELETE apaga a mensagem da conversa dos dois lados (bug histórico).
- RLS em tudo; qualquer tabela/coluna nova precisa das políticas certas (ver a de UPDATE em inbox-archive.sql como exemplo do que falha silenciosamente sem elas: update de 0 linhas sem erro).
- Token refresh está ligado ao ciclo de vida da app em App.tsx — não mexer sem ler o comentário.

## Convenções e armadilhas

- **`player.playbackRate = x` ARRANCA a reprodução** (no expo-video é `AVPlayer.rate = x`, e rate≠0 é play no AVFoundation) — qualquer código que toque no rate tem de verificar `wantsPlayRef` primeiro (bug histórico: restauro de sessão auto-tocava).
- O expo-video reativa os comandos skip ±10s do Lock Screen ao registar o player (async); o módulo remote-commands desativa-os, e o PlayerRoot re-afirma em cada mudança de `isPlaying` para ganhar essa corrida.

- Logs marcados `[duration-debug]` são temporários (validação do fix da duração no dispositivo pendente) — remover quando confirmado.
- Sheets/inputs: todo o Modal com TextInput precisa de `KeyboardAvoidingView` (padding, iOS) e listas com botões sob teclado precisam de `keyboardShouldPersistTaps="handled"`.
- Chat: FlatList `inverted` com dados invertidos (mais recente primeiro); envio otimista com rollback.
- O WebView do player (fase 3) nunca desmonta enquanto há faixa — anima entre mini e frame completo (PlayerRoot).
- Downloads: passar sempre `shouldAbort` a `downloadProgressiveAudio` em novos call sites (sem isso, trocar de faixa deixa downloads fantasma a consumir rede).
