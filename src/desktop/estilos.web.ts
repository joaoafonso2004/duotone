/**
 * Estilos partilhados do desktop.
 *
 * Vieram do `RootNavigator.web.tsx`, que tinha 2118 linhas com as doze paginas,
 * a casca e esta folha toda dentro. Era esta folha que prendia tudo junto: cada
 * pagina lia `styles`, por isso nenhuma podia sair do ficheiro sem ela sair
 * primeiro.
 *
 * Os valores saem de `tokens.web.ts`. Estilos NOVOS de uma pagina so devem
 * vir para aqui se forem MESMO partilhados; caso contrario ficam junto da
 * pagina que os usa, senao isto volta a crescer ate ao que era.
 */
import { StyleSheet } from 'react-native';
import { COR, ESP, FONT, RAIO, TIPO } from './tokens.web';
import { desktop } from './ui.web';

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COR.fundo, color: COR.texto } as any,
  // Fundo fotografico original da app, restaurado a pedido. Sangra alguns
  // pixels para o blur nao criar uma moldura nas extremidades da janela.
  backgroundImage: {
    position: 'absolute', top: -20, left: -20, right: -20, bottom: -20,
    width: 'calc(100% + 40px)' as any, height: 'calc(100% + 40px)' as any,
    resizeMode: 'cover', zIndex: 0, pointerEvents: 'none',
    filter: 'blur(8px) brightness(45%)',
  } as any,
  // Barra de titulo sem cor propria: e o fundo que se ve, e so uma linha a
  // separa da area de conteudo.
  titleBar: { height: 38, backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: COR.linhaSuave, flexDirection: 'row', alignItems: 'stretch', zIndex: 20, WebkitAppRegion: 'drag' } as any,
  titleBrand: { width: 224, flexDirection: 'row', alignItems: 'center', paddingLeft: 15, gap: 9 }, brandDots: { flexDirection: 'row', gap: 3 }, brandDot: { width: 8, height: 8, borderRadius: 4 }, titleText: { fontFamily: FONT.body, color: desktop.muted, fontSize: 12, fontWeight: '600' }, dragRegion: { flex: 1 }, windowButtons: { flexDirection: 'row', WebkitAppRegion: 'no-drag' } as any, windowButton: { width: 46, height: 37, alignItems: 'center', justifyContent: 'center' }, windowButtonHover: { backgroundColor: desktop.hover }, closeHover: { backgroundColor: '#C42B3B' },
  main: { flex: 1, flexDirection: 'row', minHeight: 0, backgroundColor: 'transparent' }, sidebar: { width: 232, borderRadius: RAIO.superficie, borderWidth: 1, borderColor: COR.linhaSuave, marginLeft: ESP.sm, marginRight: ESP.xs, marginTop: ESP.xs, marginBottom: ESP.xs, overflow: 'hidden' } as any, sidebarContent: { padding: ESP.md, paddingTop: ESP.xl }, navLabel: { ...TIPO.micro, color: COR.textoFraco, marginHorizontal: ESP.md, marginBottom: ESP.sm, marginTop: ESP.md }, navItem: { height: 40, paddingHorizontal: ESP.md, borderRadius: RAIO.cartao, flexDirection: 'row', alignItems: 'center', gap: ESP.md, marginBottom: 2 }, navHover: { backgroundColor: desktop.hover }, navActive: { backgroundColor: desktop.accentSoft }, navText: { ...TIPO.corpo, color: COR.textoMedio, fontWeight: '500' as any, flex: 1 }, navTextActive: { color: desktop.text, fontWeight: '650' as any }, navDivider: { height: 1, backgroundColor: desktop.border, marginVertical: 14, marginHorizontal: 8 },
  account: { minHeight: 67, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.03)', flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 31, height: 31, borderRadius: 9, backgroundColor: '#3D315E', alignItems: 'center', justifyContent: 'center' }, avatarText: { fontFamily: FONT.body, color: desktop.text, fontSize: 12, fontWeight: '800' }, accountName: { fontFamily: FONT.body, color: desktop.text, fontSize: 12, fontWeight: '650' as any }, accountEmail: { fontFamily: FONT.mono, color: desktop.dim, fontSize: 10, marginTop: 2 }, content: { flex: 1, minWidth: 0, borderRadius: RAIO.superficie, borderWidth: 1, borderColor: COR.linhaSuave, marginLeft: ESP.xs, marginRight: ESP.sm, marginTop: ESP.xs, marginBottom: ESP.xs, overflow: 'hidden' } as any,
  auth: { flex: 1, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, authGlow: { position: 'absolute', width: 900, height: 900, borderRadius: 450, backgroundColor: 'rgba(233,234,238,.045)', top: -480 }, authCard: { width: 440, maxWidth: 'calc(100vw - 48px)' as any, padding: ESP.xxl, borderRadius: RAIO.superficie, backgroundColor: COR.painel, borderWidth: 1, borderColor: COR.linha, boxShadow: '0 30px 100px rgba(0,0,0,.55)' } as any, authLogo: { flexDirection: 'row', gap: 5, marginBottom: 25 }, authTitle: { ...TIPO.titulo, color: COR.texto, fontSize: 28, fontWeight: '700' as any }, authBody: { ...TIPO.corpo, color: COR.textoMedio, lineHeight: 21, marginTop: ESP.sm, marginBottom: ESP.xl }, segment: { height: 38, padding: 3, borderRadius: 8, backgroundColor: desktop.bg, flexDirection: 'row', marginBottom: 18 }, segmentItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 }, segmentActive: { backgroundColor: desktop.raised }, segmentText: { fontFamily: FONT.body, color: desktop.text, fontSize: 12, fontWeight: '600' }, error: { fontFamily: FONT.body, color: '#FF858A', fontSize: 12, lineHeight: 17 }, authFoot: { fontFamily: FONT.mono, color: desktop.dim, fontSize: 10, marginTop: 20 },
  searchBar: { paddingHorizontal: 38, flexDirection: 'row', gap: 10, marginBottom: 22 }, history: { paddingHorizontal: 38, marginBottom: 20 }, sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 }, sectionTitle: { fontFamily: FONT.display, color: desktop.text, fontSize: 14, fontWeight: '700', flex: 1 }, textAction: { fontFamily: FONT.body, color: desktop.accent, fontSize: 12 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { height: 31, borderRadius: 16, paddingHorizontal: 11, borderWidth: 1, borderColor: desktop.border, flexDirection: 'row', alignItems: 'center', gap: 6 }, chipHover: { backgroundColor: desktop.hover }, chipText: { fontFamily: FONT.body, color: desktop.muted, fontSize: 11 },
  songsToolbar: { paddingHorizontal: ESP.xxxl, paddingBottom: ESP.lg, flexDirection: 'row', alignItems: 'center', gap: ESP.md }, songsSearch: { width: 390, maxWidth: '55%' as any }, songsResultCount: { ...TIPO.numero, color: COR.textoFraco, marginLeft: 'auto' as any },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: ESP.xl }, mediaCard: { width: 190, padding: ESP.md, borderRadius: RAIO.cartao, borderWidth: 1, borderColor: 'transparent' }, cardHover: { backgroundColor: desktop.raised, borderColor: desktop.border, transform: [{ translateY: -2 }] }, cardTitle: { fontFamily: FONT.display, color: desktop.text, fontSize: 13, fontWeight: '650' as any, marginTop: 11 }, cardMeta: { fontFamily: FONT.body, color: desktop.dim, fontSize: 11, marginTop: 4 },
  playlistGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: ESP.xxl, rowGap: ESP.xxl },
  playlistCard: { width: 200 },
  playlistCardHover: { opacity: .88, transform: [{ translateY: -3 }] },
  playlistArt: { width: 200, height: 200, borderRadius: 14, backgroundColor: desktop.raised, borderWidth: 1, borderColor: COR.linhaSuave, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', boxShadow: '0 15px 36px rgba(0,0,0,.22)' } as any,
  playlistArtRow: { flex: 1, width: '100%', flexDirection: 'row' },
  playlistArtCell: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: COR.elevado },
  playlistTitle: { fontFamily: FONT.display, color: desktop.text, fontSize: 14, fontWeight: '650' as any, marginTop: ESP.md },
  playlistMeta: { ...TIPO.numero, color: COR.textoFraco, marginTop: ESP.xs },
  detailHero: { minHeight: 210, flexDirection: 'row', alignItems: 'center', gap: ESP.xxl, paddingBottom: ESP.xxl, marginBottom: ESP.xl, borderBottomWidth: 1, borderBottomColor: COR.linhaSuave },
  detailHeroArt: { width: 176, height: 176, borderRadius: 14, overflow: 'hidden', backgroundColor: COR.elevado, borderWidth: 1, borderColor: COR.linhaSuave, boxShadow: '0 18px 44px rgba(0,0,0,.28)' } as any,
  detailHeroBody: { flex: 1, minWidth: 0 },
  detailHeroEyebrow: { ...TIPO.micro, color: COR.textoFraco, marginBottom: ESP.sm },
  detailHeroTitle: { fontFamily: FONT.display, color: COR.texto, fontSize: 34, lineHeight: 40, fontWeight: '720' as any, letterSpacing: -.55 },
  detailHeroMeta: { ...TIPO.corpo, color: COR.textoMedio, marginTop: ESP.sm },
  detailHeroActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: ESP.sm, marginTop: ESP.xl },
  detailSearch: { width: 390, maxWidth: '60%' as any, marginBottom: ESP.xl },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 20 }, dialogBody: { fontFamily: FONT.body, color: desktop.muted, fontSize: 13, lineHeight: 20 }, formLabel: { fontFamily: FONT.mono, color: desktop.dim, fontSize: 9, fontWeight: '800', letterSpacing: 1.1, marginBottom: 8 }, importPanel: { maxWidth: 760, padding: 24, borderWidth: 1, borderColor: desktop.border, borderRadius: 11, backgroundColor: desktop.panel }, importSummary: { minHeight: 80, marginVertical: 22, borderTopWidth: 1, borderBottomWidth: 1, borderColor: desktop.border, justifyContent: 'center' }, destinationGrid: { gap: 6 }, destination: { minHeight: 43, paddingHorizontal: 12, borderRadius: 7, borderWidth: 1, borderColor: desktop.border, flexDirection: 'row', alignItems: 'center', gap: 10 }, destinationActive: { backgroundColor: desktop.accentSoft, borderColor: 'rgba(155,123,255,.38)' }, destinationText: { fontFamily: FONT.body, color: desktop.text, fontSize: 12, flex: 1 },
  profileHero: { minHeight: 148, paddingHorizontal: ESP.sm, paddingBottom: ESP.xxl, borderBottomWidth: 1, borderBottomColor: COR.linhaSuave, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: ESP.xl },
  profileAvatarWrap: { width: 96, height: 96 }, profileAvatarHover: { transform: [{ scale: 1.025 }] }, profileAvatar: { width: 96, height: 96, borderRadius: 30, alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 35px rgba(0,0,0,.3)' } as any, profileEmoji: { fontFamily: FONT.body, fontSize: 43 }, profileAvatarEdit: { position: 'absolute', right: -3, bottom: -3, width: 29, height: 29, borderRadius: 9, backgroundColor: desktop.hover, borderWidth: 2, borderColor: desktop.panel, alignItems: 'center', justifyContent: 'center' },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, profileName: { fontFamily: FONT.display, color: desktop.text, fontSize: 24, fontWeight: '750' as any }, profileEmail: { fontFamily: FONT.body, color: desktop.muted, fontSize: 13, marginTop: 5 }, profileSince: { fontFamily: FONT.body, color: desktop.dim, fontSize: 10, fontWeight: '650' as any, letterSpacing: .45, textTransform: 'uppercase', marginTop: 10 }, profileActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  profileStats: { minHeight: 104, flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1, borderBottomColor: COR.linhaSuave, marginBottom: ESP.xxl }, profileStat: { flex: 1, minWidth: 180, paddingHorizontal: ESP.sm, paddingVertical: ESP.xl, flexDirection: 'row', alignItems: 'center', gap: ESP.md }, profileStatIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: desktop.accentSoft, alignItems: 'center', justifyContent: 'center' }, profileStatValue: { fontFamily: FONT.display, color: desktop.text, fontSize: 24, fontWeight: '700' as any }, profileStatLabel: { ...TIPO.micro, color: COR.textoFraco, marginTop: ESP.xs },
  profileColumns: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: ESP.xxxl }, profileSection: { flex: 1, minWidth: 330, overflow: 'hidden' }, profileSectionHead: { minHeight: 58, paddingHorizontal: ESP.sm, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COR.linha }, profileSectionEyebrow: { ...TIPO.micro, color: COR.textoFraco, marginBottom: ESP.xs }, profileSectionTitle: { ...TIPO.seccao, color: COR.texto }, profileSectionMeta: { ...TIPO.legenda, color: COR.textoFraco, marginLeft: 'auto' as any }, profileHistory: { backgroundColor: 'transparent' }, profileHistoryRow: { minHeight: 64, paddingHorizontal: ESP.sm, flexDirection: 'row', alignItems: 'center', gap: ESP.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COR.linhaSuave }, profileHistoryHover: { backgroundColor: COR.hover }, profileRank: { ...TIPO.numero, width: 20, textAlign: 'center', color: COR.textoFraco }, profileTrackTitle: { ...TIPO.corpo, color: COR.texto, fontWeight: '500' as any }, profileTrackArtist: { ...TIPO.legenda, color: COR.textoMedio, marginTop: 2 }, profileCount: { minWidth: 38, height: 24, paddingHorizontal: ESP.sm, borderRadius: RAIO.pilula, backgroundColor: COR.elevado, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ESP.xs }, profileCountText: { ...TIPO.numero, color: COR.textoMedio, fontSize: 10 }, profileRecentTime: { ...TIPO.numero, color: COR.textoFraco, fontSize: 10, width: 34, textAlign: 'right' }, profileHistoryEmpty: { minHeight: 190, padding: ESP.xxl, alignItems: 'center', justifyContent: 'center', gap: ESP.sm, borderBottomWidth: 1, borderBottomColor: COR.linhaSuave }, profileHistoryEmptyText: { ...TIPO.legenda, color: COR.textoFraco, textAlign: 'center', lineHeight: 18, maxWidth: 260 },
  avatarPreview: { width: 88, height: 88, borderRadius: 28, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }, avatarPreviewEmoji: { fontFamily: FONT.body, fontSize: 40 }, avatarSwatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, avatarSwatchOuter: { width: 43, height: 43, borderRadius: 14, padding: 3, borderWidth: 2, borderColor: 'transparent' }, avatarSwatchSelected: { borderColor: desktop.text }, avatarSwatch: { flex: 1, borderRadius: 10 }, avatarEmojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, avatarEmojiCell: { width: 46, height: 46, borderRadius: 9, backgroundColor: desktop.raised, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' }, avatarEmojiSelected: { backgroundColor: desktop.accentSoft, borderColor: 'rgba(155,123,255,.55)' }, avatarEmojiText: { fontFamily: FONT.body, fontSize: 23 },
  statsHero: { borderRadius: 12, padding: 22, marginBottom: 18 }, statsHeroLabel: { fontFamily: FONT.mono, color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, opacity: .85 }, statsHeroValue: { fontFamily: FONT.display, color: '#FFF', fontSize: 38, fontWeight: '800', marginTop: 6, letterSpacing: -.5 }, statsHeroNote: { fontFamily: FONT.body, color: '#FFF', fontSize: 11, marginTop: 4, opacity: .8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 26 }, statsCell: { flexGrow: 1, flexBasis: 150, borderRadius: 10, borderWidth: 1, borderColor: desktop.border, backgroundColor: desktop.panel, padding: 16 }, statsCellValue: { fontFamily: FONT.display, color: desktop.text, fontSize: 24, fontWeight: '800' },
  statsChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 140, marginTop: 10 }, statsRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 7, cursor: 'pointer' } as any, statsRank: { fontFamily: FONT.mono, width: 18, textAlign: 'center', fontSize: 12, fontWeight: '800' },
  settingsGrid: { flexDirection: 'column', alignItems: 'stretch', gap: ESP.lg, maxWidth: 720 }, settingsCard: { width: '100%' as any, maxWidth: 720, borderRadius: 10, borderWidth: 1, borderColor: desktop.border, backgroundColor: desktop.panel, overflow: 'hidden' }, settingsCardTitle: { height: 53, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: desktop.border }, settingLine: { minHeight: 52, paddingHorizontal: 17, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: desktop.border, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingHover: { backgroundColor: desktop.hover }, settingLabel: { fontFamily: FONT.body, color: desktop.text, fontSize: 12, fontWeight: '550' as any }, settingValue: { fontFamily: FONT.body, color: desktop.muted, fontSize: 12, textAlign: 'right', maxWidth: 230 }, settingDescription: { fontFamily: FONT.body, color: desktop.dim, fontSize: 10, marginTop: 4 }, smallSegment: { padding: 3, backgroundColor: desktop.bg, borderRadius: 7, flexDirection: 'row' }, smallSegmentItem: { minHeight: 30, paddingHorizontal: 10, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }, smallSegmentActive: { backgroundColor: desktop.hover }, smallSegmentText: { fontFamily: FONT.mono, color: desktop.dim, fontSize: 10 },
  player: { height: 80, backgroundColor: COR.painel, borderRadius: RAIO.superficie, borderWidth: 1, borderColor: COR.linhaSuave, marginLeft: ESP.sm, marginRight: ESP.sm, marginTop: ESP.xs, marginBottom: ESP.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, zIndex: 25 }, playerTrack: { width: '30%', minWidth: 210, maxWidth: 390, flexDirection: 'row', alignItems: 'center', gap: ESP.xs }, playerTrackLink: { maxWidth: 'calc(100% - 42px)' as any, minWidth: 0, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: ESP.md }, playerSave: { flexShrink: 0 }, playerTitle: { ...TIPO.corpo, color: COR.texto, fontWeight: '600' as any, minWidth: 0, flexShrink: 1 }, playerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', maxWidth: 760 }, playerControls: { flexDirection: 'row', alignItems: 'center', gap: 6 }, playButton: { width: 35, height: 35, borderRadius: 18, backgroundColor: desktop.text, alignItems: 'center', justifyContent: 'center', marginHorizontal: 5 }, progressRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 3 }, timeText: { ...TIPO.numero, width: 42, color: COR.textoFraco, fontSize: 11, textAlign: 'center' }, progressHit: { flex: 1, height: 14, justifyContent: 'center', cursor: 'pointer' } as any, progressTrack: { height: 3, backgroundColor: '#353540', borderRadius: 2, overflow: 'hidden' }, progressFill: { height: 3, backgroundColor: desktop.text, borderRadius: 2 }, playerRight: { width: '30%', minWidth: 120, maxWidth: 390, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }, playerError: { fontFamily: FONT.body, color: desktop.danger, fontSize: 10, maxWidth: 220 },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 16 }, volumeHit: { width: 90, height: 14, justifyContent: 'center', cursor: 'pointer' } as any, volumeTrack: { height: 4, backgroundColor: '#353540', borderRadius: 2, overflow: 'hidden' }, volumeFill: { height: 4, backgroundColor: '#A09DA9', borderRadius: 2 },

  // ---------------------------------------------------------------- social --
  // Estava fora do sistema: raios de 7, 8, 9 e 10 (a escala e 4/8/14/999),
  // letras de 10 a 13 px com peso 600, `marginHorizontal: 38` a martelo
  // enquanto o resto da app respira a 48, e o roxo do tema como destaque.
  // Pior, caixas dentro de caixas: um cartao com uma superficie elevada la
  // dentro e uma terceira para a mensagem.
  //
  // Passa a ser o que as outras paginas ja sao: listas abertas separadas por
  // fios, alinhadas a mesma margem, com a luz como destaque em vez de cor.
  socialTabBar: { flexDirection: 'row', gap: ESP.xl, paddingHorizontal: ESP.xxxl, borderBottomWidth: 1, borderBottomColor: COR.linhaSuave },
  socialTab: { paddingVertical: ESP.md, borderBottomWidth: 2, borderBottomColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: ESP.sm },
  socialTabAtivo: { borderBottomColor: COR.texto },
  socialTabText: { ...TIPO.corpo, color: COR.textoFraco, fontWeight: '550' as any },
  socialTabTextAtivo: { color: COR.texto },
  /** As contagens em mono, como todos os numeros da app. */
  socialTabConta: { ...TIPO.numero, color: COR.textoFraco },

  /** Uma so densidade para amigos, pedidos, perfis e itens da caixa. */
  socialLinha: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: ESP.md, paddingVertical: ESP.md, borderBottomWidth: 1, borderBottomColor: COR.linhaSuave },
  socialLinhaHover: { backgroundColor: COR.hover },
  socialNome: { ...TIPO.corpo, color: COR.texto, fontWeight: '550' as any },
  socialUtilizador: { ...TIPO.legenda, color: COR.textoFraco, marginTop: 1 },
  socialEstado: { ...TIPO.legenda, color: COR.textoMedio, marginTop: 3 },
  socialAcoes: { flexDirection: 'row', alignItems: 'center', gap: ESP.xs },
  /** Etiqueta discreta para estados sem accao ("Friend", "Requested"). */
  socialEtiqueta: { ...TIPO.micro, color: COR.textoFraco },

  // --- caixa de entrada ---
  socialRemetente: { ...TIPO.micro, color: COR.textoFraco },
  socialItem: { paddingVertical: ESP.lg, borderBottomWidth: 1, borderBottomColor: COR.linhaSuave },
  socialItemCabeca: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: ESP.md },
  socialPartilha: { flexDirection: 'row', alignItems: 'center', gap: ESP.md },
  socialPartilhaTitulo: { ...TIPO.corpo, color: COR.texto, fontWeight: '550' as any },
  socialPartilhaNota: { ...TIPO.legenda, color: COR.textoMedio, marginTop: 2 },
  /** A mensagem e uma citacao, nao mais uma caixa: um fio a esquerda chega. */
  socialMensagem: { ...TIPO.legenda, color: COR.textoMedio, lineHeight: 19, borderLeftWidth: 2, borderLeftColor: COR.linha, paddingLeft: ESP.md, marginTop: ESP.md },
  // --- conversa ---
  // As bolhas eram roxas (o `theme.color`) e obrigavam a calcular se o texto
  // por cima devia ser preto ou branco. Passam a falar a mesma lingua do botao
  // primario: a minha e LUZ com texto escuro, a dele e uma superficie elevada.
  // Some o calculo de contraste e some o roxo.
  socialBolha: { padding: ESP.md, borderRadius: RAIO.cartao },
  socialBolhaMinha: { backgroundColor: COR.metalClaro, borderBottomRightRadius: RAIO.ctrl },
  socialBolhaDele: { backgroundColor: COR.elevado, borderBottomLeftRadius: RAIO.ctrl },
  socialBolhaTexto: { ...TIPO.legenda, lineHeight: 18 },
  socialBolhaMeta: { ...TIPO.micro, color: COR.textoFraco },
  socialFaixaNaBolha: { flexDirection: 'row', alignItems: 'center', gap: ESP.sm, padding: ESP.xs, borderRadius: RAIO.ctrl },
  socialSemMensagens: { ...TIPO.legenda, color: COR.textoFraco, textAlign: 'center', marginVertical: 60 },
  socialIconeCaixa: { width: 44, height: 44, borderRadius: RAIO.ctrl, backgroundColor: COR.elevado, alignItems: 'center', justifyContent: 'center' },

  // ------------------------------------------------------------ now playing --
  // Tudo sai dos tokens. O que substitui: raios de 12, 18 e 20, superficies
  // marteladas fora da paleta (#101016, #14141d, rgba(255,255,255,.02)),
  // fontes de 9, 10, 12, 16 e 22 px e pesos 500/600/700/800.
  npGrelha: { flexDirection: 'row', alignItems: 'flex-start', gap: 64, paddingTop: ESP.sm, paddingBottom: ESP.xxl },
  npLado: { flexShrink: 0 },
  npArtworkFrame: { borderRadius: RAIO.superficie, borderWidth: 1, borderColor: 'rgba(233,234,238,.14)', boxShadow: '0 26px 70px rgba(0,0,0,.46), 0 1px 0 rgba(255,255,255,.06)' } as any,
  npVisualControls: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ESP.sm, marginTop: ESP.md },
  npVisualGroup: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  npVisualDivider: { width: 1, height: 18, backgroundColor: COR.linha, marginHorizontal: ESP.xs },
  npVisualOption: { minHeight: 28, paddingHorizontal: ESP.sm, borderRadius: RAIO.pilula, alignItems: 'center', justifyContent: 'center' },
  npVisualOptionActive: { backgroundColor: COR.metalSuave },
  npVisualOptionText: { ...TIPO.micro, color: COR.textoFraco, textTransform: 'capitalize' },
  npVisualOptionTextActive: { color: COR.texto },
  npTitleRow: { flexDirection: 'row', alignItems: 'center', gap: ESP.lg, marginTop: ESP.xl, paddingHorizontal: ESP.xs },
  npTitulo: { fontFamily: FONT.display, color: COR.texto, fontSize: 28, fontWeight: '700' as any, letterSpacing: -.45, lineHeight: 34, flex: 1 },
  // A fila e uma coluna editorial aberta, nao outra caixa dentro da pagina.
  // As linhas e o destaque da proxima faixa chegam para lhe dar estrutura.
  npFila: { flex: 1, minWidth: 300 },
  npFilaCabeca: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: ESP.sm, paddingBottom: ESP.md, borderBottomWidth: 1, borderBottomColor: COR.linha },
  npFilaHeading: { ...TIPO.titulo, color: COR.texto, marginTop: 2 },
  npFilaContagem: { ...TIPO.numero, color: COR.textoFraco },
  npFilaTitulo: { ...TIPO.corpo, color: COR.texto, fontWeight: '550' as any },
  npFilaVazia: { ...TIPO.legenda, color: COR.textoFraco, textAlign: 'center', paddingVertical: ESP.xl, borderTopWidth: 1, borderTopColor: COR.linhaSuave },
});
