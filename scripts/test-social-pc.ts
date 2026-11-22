/**
 * O Social do PC (30/10, passo 7 de `docs/PLANO-ELEVAR-PC.md`): quem está a ouvir
 * em cartões com "Listen along" ao passar o rato, as conversas sem o balão em
 * cada linha, e as músicas partilhadas a dois tons até serem tuas. O que é
 * partilhado com o iPhone (`ChatAmigo.tsx`, `SocialHub.tsx`) só ganhou um par de
 * plataformas: o iPhone fica como estava. A lista é testada por inteiro em
 * `test-social-overview.cjs`; aqui lê-se o código como TEXTO.
 *
 * Correr: node --experimental-strip-types scripts/test-social-pc.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let falhas = 0;
function caso(nome: string, fn: () => void): void {
  try { fn(); console.log(`  ok    ${nome}`); }
  catch (e) { falhas++; console.log(`  FALHA ${nome}\n        ${(e as Error).message}`); }
}
// Os finais de linha do Windows (o CI faz checkout com CRLF): tudo em LF.
const ler = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const LISTA = ler('src/components/SocialOverview.web.tsx');
const LISTA_IOS = ler('src/components/SocialOverview.tsx');
/** O Social do PC na pele da B4 (22/11): o cabeçalho, o campo e o painel do amigo. */
const PAINEL = ler('src/components/SocialPc.web.tsx');
const CHAT = ler('src/components/ChatAmigo.tsx');
const CAPA_IOS = ler('src/components/CapaDaFaixaPartilhada.tsx');
const CAPA_PC = ler('src/components/CapaDaFaixaPartilhada.web.tsx');
const CASCA = ler('src/desktop/casca.web.tsx');
const HUB = ler('src/components/SocialHub.tsx');

console.log('\no que é do iPhone fica como estava');
caso('a lista do iPhone não foi tocada: nem cartões do PC nem as marcas do PC', () => {
  assert.ok(!/desktop\/|marcar\(|CapaDuotone|Listen along/.test(LISTA_IOS), 'a lista do iPhone importa coisas do PC');
});
caso('o iPhone desenha a capa e a nota musical de sempre, e não tem etiqueta', () => {
  // Desde 11/11 com reserva: quando uma capa não carrega, passa à seguinte.
  assert.match(CAPA_IOS, /<Image\s+key=\{capa\}\s+source=\{\{ uri: capa \}\}\s+style=\{estilo\}\s+contentFit="cover"\s+onError=\{\(\) => setFalhas\(\{ chave, n: n \+ 1 \}\)\}/);
  assert.match(CAPA_IOS, /const capa = capas\[n\];/);
  assert.match(CAPA_IOS, /<Ionicons name="musical-notes" size=\{15\} color=\{colors\.textTertiary\} \/>/);
  assert.match(CAPA_IOS, /export function EtiquetaDaFaixaPartilhada\(_props: \{ faixa: Track \}\): React\.ReactElement \| null \{\n  return null;/);
  assert.ok(!/desktop\//.test(CAPA_IOS), 'o iPhone não pode importar ficheiros do PC');
});
caso('a conversa partilhada só troca a capa e a etiqueta por um par de plataformas; o resto é igual', () => {
  assert.match(CHAT, /import \{ CapaDaFaixaPartilhada, EtiquetaDaFaixaPartilhada \} from '\.\/CapaDaFaixaPartilhada';/);
  assert.match(CHAT, /<CapaDaFaixaPartilhada faixa=\{faixa\} capas=\{capas\} estilo=\{styles\.capa\} estiloVazio=\{\[styles\.capa, styles\.semCapa\]\} \/>/);
  assert.match(CHAT, /const capas = capasDaFaixaPartilhada\(faixa\);/, 'a guardada e a do vídeo de reserva (11/11)');
  assert.match(CHAT, /<EtiquetaDaFaixaPartilhada faixa=\{faixa\} \/>/);
  assert.match(CHAT, /<BotaoGuardar track=\{faixa\} tamanho=\{17\} \/>/, 'o guardar continua no cartão');
});
caso('o SocialHub (a lógica) não mudou de comportamento: continua a ser quem monta a lista', () => {
  assert.match(HUB, /<SocialOverview key=\{myId\?\?'signed-out'\}/);
});

console.log('\na música partilhada a dois tons');
caso('a dois tons enquanto não é tua, a cores quando a guardas (a regra da Discover daily)', () => {
  assert.match(CAPA_PC, /s\.keys\.has\(`\$\{faixa\.source\}:\$\{faixa\.sourceId\}`\)/);
  assert.match(CAPA_PC, /<CapaDuotone uri=\{capa\} viva=\{minha\} style=\{\{ borderRadius \}\} \/>/);
});
caso('a etiqueta "New to you" só enquanto a música não é tua', () => {
  assert.match(CAPA_PC, /if \(minha\) return null;\n  return <Text numberOfLines=\{1\} style=\{estilos\.etiqueta\}>NEW TO YOU<\/Text>;/);
});
caso('sem capa, a nota musical, como no iPhone; o tamanho e o raio são os da capa de sempre', () => {
  assert.match(CAPA_PC, /if \(!capa\) \{\n    return <View style=\{estiloVazio\}><Ionicons name="musical-notes"/);
  assert.match(CAPA_PC, /const \{ width, height, borderRadius \} = StyleSheet\.flatten\(estilo\)/);
});
caso('nenhum pedido novo: só a biblioteca em memória', () => {
  assert.ok(!/supabase|fetch\(|api\//.test(CAPA_PC));
});

console.log('\nquem está a ouvir');
// A B4 (22/11, .claude/planos/PLANO-SOCIAL-B4.md): quem ouve passou do cartão à linha dos amigos da lateral, maior.
caso('uma linha por amigo, a cores enquanto ouve e a dois tons quando ouviu há pouco', () => {
  assert.match(LISTA, /<CapaDuotone uri=\{cover\} viva=\{a\.listening\} style=\{\{ borderRadius: RAIO\.cartao \}\}\/>/);
  assert.match(LISTA, /const mostrados = listening\.slice\(0, CARTOES_A_OUVIR\);/);
  assert.match(LISTA, /<QuemOuve amigo=\{f\} agora=\{props\.now\} aoTrack=\{props\.onTrack\} aoAbrir=\{\(\) => props\.onOpen\('friend', f\.friendId\)\}/);
});
caso('a etiqueta mono conta quem ouve agora, e sem ninguém diz "RECENTLY PLAYED"', () => {
  assert.match(LISTA, /\{aOuvirAgora \? `LISTENING NOW · \$\{aOuvirAgora\}` : 'RECENTLY PLAYED'\}/);
  assert.match(LISTA, /etiqueta: \{ \.\.\.TIPO\.micro, color: COR\.textoFraco/);
});
caso('"Listen along" só para quem ouve agora: a Jam dele se tiver, senão segue-o (a porta do menu do botão direito)', () => {
  assert.match(LISTA, /\{a\.listening \? <Pressable \{\.\.\.marcar\('ouvinte-play', \.\.\.\(sigo \? \['a-seguir'\] : \[\]\)\)\}/);
  assert.match(LISTA, /if \(sigo\) useSeguirAmigo\.getState\(\)\.parar\(null\); else void ouvirJunto\(amigo\);/);
  assert.match(LISTA, /const jams = await jamsDosAmigos\(\)\.catch\(\(\) => new Map<string, string>\(\)\);\n  await ouvirComAmigo\(amigo, jams\.get\(amigo\.friendId\) \?\? null\);/);
});
caso('a pergunta das Jams é a partilhada com a Home (2 min), e só se faz ao carregar', () => {
  assert.match(LISTA, /import \{ jamsDosAmigos \} from '\.\.\/state\/jamsDosAmigos';/);
  assert.equal((LISTA.match(/jamsDosAmigos\(/g) ?? []).length, 1);
  // O painel do amigo usa a MESMA porta (o ouvirJunto da lista), sem pergunta nova.
  assert.ok(!/jamsDosAmigos\(/.test(PAINEL), 'o painel não pergunta as Jams por si');
  assert.match(PAINEL, /import \{ Barrinhas, ouvirJunto \} from '\.\/SocialOverview\.web';/);
});
caso('o ▶ aparece com o rato na linha ou com o foco (CSS), e fica a seguir; as barrinhas só mexem em CSS', () => {
  assert.match(CASCA, /\[data-dt~="ouvinte"\]:hover \[data-dt~="ouvinte-play"\], \[data-dt~="ouvinte-play"\]:focus-visible, \[data-dt~="ouvinte-play"\]\[data-dt~="a-seguir"\]\{ opacity: 1; \}/);
  // Aos saltos (22/11): 4 desenhos por segundo, e não 60.
  assert.match(CASCA, /\[data-dt~="eq"\] > \*\{ transform-origin: bottom; animation: dt-eq 1s step-end infinite; \}/);
  assert.match(CASCA, /@keyframes dt-eq\{ 0%\{ transform: scaleY\(\.3\); \} 25%\{ transform: scaleY\(\.7\); \} 50%\{ transform: scaleY\(1\); \} 75%\{ transform: scaleY\(\.55\); \} 100%\{ transform: scaleY\(\.3\); \} \}/);
});

console.log('\nas conversas');
caso('sem o balão em cada linha: a linha abre a conversa, e só uma conversa antiga leva o lixo', () => {
  assert.ok(!/icon=\{oldContact \? 'trash-outline' : 'chatbubble-outline'\}/.test(LISTA));
  assert.match(LISTA, /\{oldContact && <SocialIconButton label=\{`Delete conversation with \$\{c\.nome\}`\} icon="trash-outline"/);
  assert.match(LISTA, /<Text accessibilityRole="header" style=\{styles\.etiqueta\}>CONVERSATIONS<\/Text>/);
});
caso('a linha acende com o rato, e o contador de não lidas continua', () => {
  assert.match(CASCA, /\[data-dt~="conversa"\]:hover\{ background-color: rgba\(233,234,238,\.05\); \}/);
  assert.match(LISTA, /\{count > 0 && <View \{\.\.\.marcar\('contador'\)\} style=\{styles\.contador\}>/);
  assert.match(CASCA, /\[data-dt~="contador"\]\{ animation: dt-contador var\(--dt-soltar-ms\) var\(--dt-soltar\) both; \}/);
});
caso('a ordem por interação, o botão direito num amigo e a pré-visualização ficam como estavam', () => {
  assert.match(LISTA, /ordenarConversas</);
  assert.match(LISTA, /previaDaConversa\(preview, props\.myId/);
  assert.match(LISTA, /const menuDoAmigo = \(id: string\) => \(e: any\) => \{\n    e\.preventDefault\(\);\n    props\.onFriendMenu\?\.\(id,/);
  assert.match(LISTA, /const menu = !group && !oldContact && props\.onFriendMenu \? \{ onContextMenu: menuDoAmigo\(c\.id\) \} : \{\};/);
});
caso('nada de className nem de backdrop-filter', () => {
  for (const f of [LISTA, CAPA_PC]) {
    assert.ok(!/className\s*[=:]/.test(f.replace(/\/\*[\s\S]*?\*\//g, '')));
    assert.ok(!/backdrop-?[fF]ilter/.test(f));
  }
});

console.log('\no look da conversa no PC (a maquete)');
caso('o dia é só texto mono ao centro no PC, sem pílula (B4), e o texto de sempre no iPhone', () => {
  assert.match(HUB, /const estiloDoSeparador=web\n\s+\?\{\.\.\.type\.micro,alignSelf:'center' as const,color:colors\.textTertiary,marginBottom:8,marginTop:6\}\n\s+:\{alignSelf:'center' as const,fontSize:12,fontWeight:'600' as const,color:colors\.textTertiary,marginBottom:8,marginTop:4\};/);
});
caso('os balões do PC: raio 14, e 4 nos cantos do lado de quem fala que se juntam ao grupo (B4)', () => {
  assert.match(HUB, /borderRadius:web\?14:20,gap:8,/);
  assert.match(HUB, /\?\{\.\.\.\(comAAntiga\?\{\[minha\?'borderTopRightRadius':'borderTopLeftRadius'\]:4\}:\{\}\),\.\.\.\(!fimDoGrupo\?\{\[minha\?'borderBottomRightRadius':'borderBottomLeftRadius'\]:4\}:\{\}\)\}/);
  assert.match(HUB, /:fimDoGrupo\?\{\[minha\?'borderBottomRightRadius':'borderBottomLeftRadius'\]:6\}:\{\}\),/, 'o iPhone fica com o canto de sempre');
});
caso('o que escreves é um balão claro com letra escura, só no PC e só quando é só texto (sem música, playlist nem resposta)', () => {
  assert.match(HUB, /const claro=web&&minha&&!m\.trackData&&!m\.playlistId&&!m\.album&&!cit;/);
  assert.match(HUB, /backgroundColor:claro\?colors\.text:\(minha\?tema\.soft:colors\.surface\),/);
  assert.match(HUB, /claro&&\{color:colors\.bg\}\]\}>\{m\.message\}<\/Text>/);
});
caso('os balões não passam dos 62 % no PC, e dos 92 % de sempre no iPhone', () => {
  assert.match(HUB, /maxWidth:web\?'62%':'92%'/);
});
caso('o cabeçalho da conversa (B4): a cara de 44, o nome em Archivo 26 e as ações de texto, pela mesma porta do iPhone', () => {
  assert.match(HUB, /\{web&&!group&&<CabecalhoDaConversaPc titulo=\{title\}/);
  assert.match(HUB, /aoOuvirJuntos=\{\(\)=>friend&&ouvirJuntosCom\(friend\)\}/);
  assert.match(HUB, /acoes=\{conversation\?<MusicasDaConversa alvo=\{conversation\} conversa=\{\{tipo:'amigo',nome:title\}\}/, 'Play all e Save as playlist sobem ao cabeçalho');
  assert.match(PAINEL, /<FriendAvatar avatarUrl=\{amigo\?\.avatarUrl \?\? null\} name=\{titulo\} size=\{44\}\/>/);
  assert.match(PAINEL, /fontFamily: FONT\.display, fontSize: 26, fontWeight: '650' as any/);
  // Start a Jam só quando ele não está a ouvir; a ouvir, o Listen along é do painel (ou daqui, sem ele).
  assert.match(PAINEL, /\{amigo && !musica \? <AcaoDeTexto rotulo=\{`Start a Jam with \$\{titulo\}`\}/);
  assert.match(PAINEL, /\{amigo && musica && !comPainel && !sigo \? <AcaoDeTexto rotulo=\{`Listen along with \$\{titulo\}`\}/);
});
caso('o campo de escrever (B4): flutuante de 52, o + dentro, e o enviar num disco de metal que roda ao trocar ♪ e ↑', () => {
  assert.match(HUB, /web\?<CampoDeEscreverPc campoRef=\{campo\} valor=\{draft\} aoMudar=\{setDraft\} ocupado=\{busy\} aoEnviar=\{\(\)=>void send\(\)\}/);
  assert.match(PAINEL, /<View style=\{\[flutuante\(RAIO\.superficie\), \{ flexDirection: 'row', alignItems: 'flex-end', gap: ESP\.sm, minHeight: 52,/);
  assert.match(PAINEL, /<Pressable \{\.\.\.marcar\('disco-metal', comTexto \? 'com-texto' : ''\)\}/);
  assert.match(PAINEL, /<Ionicons name=\{manda \? 'musical-note' : 'arrow-up'\}/);
  assert.match(CASCA, /\[data-dt~="a-seguir"\] > \[data-dt~="vira"\], \[data-dt~="com-texto"\] > \[data-dt~="vira"\]\{ transform: rotate\(360deg\); \}/);
});
caso('o compositor antigo fica só no iPhone, com o botão "Send" de sempre (o do PC é o CampoDeEscreverPc, B4)', () => {
  assert.match(HUB, /web\?<CampoDeEscreverPc /);
  assert.match(HUB, /<Ionicons name="arrow-up" size=\{20\} color=\{colors\.bg\}\/><\/Pressable>\n\s+:<SocialButton primary disabled=\{busy\|\|!draft\.trim\(\)\} onPress=\{\(\)=>void send\(\)\}>Send<\/SocialButton>\)/);
});
caso('a conversa sem moldura (B4): na mesma superfície que a lista, com o painel dele e a cor', () => {
  assert.ok(!/borderColor:colors\.borderStrong,borderRadius:22,overflow:'hidden'/.test(HUB), 'a caixa com moldura saiu');
  assert.match(HUB, /\{conversation\?<LayoutDaConversa chave=\{key\} amigo=\{group\?null:\(friend as SocialFriend\|null\)\?\?null\} largura=\{width\}>\{chat\}<\/LayoutDaConversa>:/);
  assert.match(PAINEL, /const comPainel = !!musica && largura >= SOCIAL_COM_PAINEL;/);
  assert.match(PAINEL, /useEffect\(\(\) => \{ definirCorDaConversa\(capa \?\? null\); \}, \[capa\]\);/);
});
caso('o painel dele: as próximas vêm da presença que já está em memória (nenhum pedido), no máximo cinco', () => {
  assert.match(PAINEL, /const fila = \(presencaDe\(amigoId\)\?\.currently_playing as any\)\?\.aSeguir;/);
  assert.match(PAINEL, /\.slice\(0, PROXIMAS_NO_PAINEL\)/);
  assert.match(PAINEL, /const PROXIMAS_NO_PAINEL = 5;/);
  assert.ok(!/supabase|fetch\(/.test(PAINEL), 'nenhum pedido novo no Social do PC');
  assert.match(PAINEL, /`UP NEXT · \$\{nome\}`/);
  assert.match(PAINEL, /\{sigo \? 'Leave' : 'Listen along'\}/);
});
caso('o painel entra 140 ms depois de a conversa abrir lugar, e sai com a curva de sair (B4)', () => {
  assert.match(CASCA, /\[data-dt~="conversa-com-painel"\]\{ transition: padding-right 460ms var\(--dt-entrada\); \}/);
  assert.match(CASCA, /\[data-dt~="painel-amigo"\]\{ animation: dt-painel-amigo 320ms var\(--dt-entrada\) 140ms both; \}/);
  assert.match(CASCA, /\[data-dt~="painel-amigo"\]\[data-dt~="a-sair"\]\{ animation: dt-painel-amigo-sai 190ms var\(--dt-sair\) both; \}/);
  assert.match(CASCA, /html\[data-a-redimensionar\] \[data-dt~="conversa-com-painel"\]\{ transition: none; \}/, 'durante o arrasto não há transição');
});
caso('a cor da conversa é a camada do Now Playing, só com "Whole window", e o Now Playing manda', () => {
  const NAV = ler('src/navigation/RootNavigator.web.tsx');
  assert.match(NAV, /const corDaConversa = useSaida\(corDoLeitor === 'janela' && route\.name === 'social' && !leitorAberto && !!capaDaConversa, SAIDA_DO_LEITOR_MS\);/);
  assert.match(NAV, /\{corDaConversaMontada && <FundoDaCapa onde="janela" aApagar=\{corDaConversaApaga\} uri=\{ultimaCapaDaConversa\.current\} \/>\}/);
  assert.match(NAV, /const corDaConversaMontada = corDaConversa\.montado && !corNaJanela && !corDoArtistaMontada/);
});
caso('os diálogos do Social são o Dialog do PC (com a saída), e o SocialModal de sempre no iPhone', () => {
  assert.ok(!/<SocialModal /.test(HUB), 'o SocialHub já não chama o SocialModal diretamente');
  assert.equal((HUB.match(/<DialogoDoSocial /g) ?? []).length, 5);
  assert.match(PAINEL, /return <Dialog open=\{visible\} title=\{title\} onClose=\{onClose\} width=\{largura \?\? 460\}>\{children\}<\/Dialog>;/);
  assert.match(ler('src/components/SocialPc.tsx'), /return <SocialModal visible=\{visible\} title=\{title\} onClose=\{onClose\}>\{children\}<\/SocialModal>;/);
});
caso('as mensagens entram (B4): a tua sobe com a SOLTAR, a dele chega com a ENTRADA, e ao abrir em cascata', () => {
  assert.match(HUB, /const entrada=!naoVista\?null:primeiraLeva\?\(index<10\?'cascata' as const:null\):minha\?'minha' as const:'dele' as const;/);
  assert.match(CASCA, /\[data-dt~="msg-minha"\] > div\{ transform-origin: 100% 100%; animation: dt-msg-sobe var\(--dt-soltar-ms\) var\(--dt-soltar\) both; \}/);
  assert.match(CASCA, /@keyframes dt-msg-sobe\{ from\{ opacity: 0; transform: translateY\(26px\) scale\(\.94\); \}/);
  assert.match(CASCA, /@keyframes dt-msg-chega\{ from\{ opacity: 0; transform: translateY\(8px\) scale\(\.98\); \}/);
});

console.log('\no menu de uma música da app no perfil e no Social (PC)');
const PERFIL = ler('src/components/SocialProfileView.tsx');
const PAGINA_PERFIL = ler('src/desktop/paginas/ProfilePage.web.tsx');
const NAVEGADOR = ler('src/navigation/RootNavigator.web.tsx');
caso('as reticências do perfil abrem o menu novo no PC e a folha de sempre no iPhone (que não passa a prop)', () => {
  assert.match(PERFIL, /onPress=\{\(\)=>aoMenuDaFaixa\?aoMenuDaFaixa\(entry\):setTrack\(entry\)\}\/>/);
  assert.match(PERFIL, /aoMenuDaFaixa\?:\(track:Track\)=>void;/);
});
caso('o botão direito numa música do perfil abre o mesmo menu', () => {
  assert.match(PERFIL, /\{\.\.\.\(aoMenuDaFaixa\?\(\{onContextMenu:\(e:any\)=>\{e\.preventDefault\?\.\(\);aoMenuDaFaixa\(entry\);\}\} as any\):\{\}\)\}>/);
});
caso('a música do momento de um amigo usa o menu novo; a tua mantém o "Remove from profile" da folha antiga', () => {
  assert.match(PERFIL, /if\(aoMenuDaFaixa&&!own&&highlights\.moment\)\{aoMenuDaFaixa\(highlights\.moment\);return;\}setTrackDoMomento\(true\);setTrack\(highlights\.moment\);/);
});
caso('a casca passa-lhe o `more` (o menu de qualquer lista), no perfil, no de um amigo e no Social', () => {
  assert.match(NAVEGADOR, /<ProfilePage aoMenuDaFaixa=\{\(t\) => void more\(t\)\} \/>/);
  assert.match(NAVEGADOR, /<ProfilePage userId=\{route\.userId\} back=\{back\} aoMenuDaFaixa=\{\(t\) => void more\(t\)\} \/>/);
  assert.match(NAVEGADOR, /<SocialPage friendId=\{route\.friendId\} groupId=\{route\.groupId\} visible=\{!nowPlayingOpen && !jamOpen\} aoMenuDaFaixa=\{\(t\) => void more\(t\)\} \{\.\.\.common\} \/>/, 'e o comum: tocar e partilhar o álbum de uma mensagem (16/11)');
  assert.match(PAGINA_PERFIL, /aoMenuDaFaixa=\{aoMenuDaFaixa\}\/>/);
});
caso('no Social, o cartão de quem ouve, a música de uma mensagem e as de um grupo abrem o menu novo', () => {
  assert.equal((HUB.match(/aoMenuDaFaixa\?aoMenuDaFaixa\(/g) ?? []).length, 3);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
