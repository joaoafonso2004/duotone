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
  assert.match(CAPA_IOS, /<Image source=\{\{ uri: capa \}\} style=\{estilo\} contentFit="cover" \/>/);
  assert.match(CAPA_IOS, /<Ionicons name="musical-notes" size=\{15\} color=\{colors\.textTertiary\} \/>/);
  assert.match(CAPA_IOS, /export function EtiquetaDaFaixaPartilhada\(_props: \{ faixa: Track \}\): React\.ReactElement \| null \{\n  return null;/);
  assert.ok(!/desktop\//.test(CAPA_IOS), 'o iPhone não pode importar ficheiros do PC');
});
caso('a conversa partilhada só troca a capa e a etiqueta por um par de plataformas; o resto é igual', () => {
  assert.match(CHAT, /import \{ CapaDaFaixaPartilhada, EtiquetaDaFaixaPartilhada \} from '\.\/CapaDaFaixaPartilhada';/);
  assert.match(CHAT, /<CapaDaFaixaPartilhada faixa=\{faixa\} capa=\{capa\} estilo=\{styles\.capa\} estiloVazio=\{\[styles\.capa, styles\.semCapa\]\} \/>/);
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
caso('um cartão por amigo, a cores enquanto ouve e a dois tons quando ouviu há pouco', () => {
  assert.match(LISTA, /<CapaDuotone uri=\{cover\} viva=\{a\.listening\} style=\{\{ borderRadius: 8 \}\}\/>/);
  assert.match(LISTA, /\{listening\.slice\(0, CARTOES_A_OUVIR\)\.map\(f => <CartaoAOuvir key=\{f\.friendId\} amigo=\{f\} agora=\{props\.now\} aoAbrir=\{props\.onTrack\}\/>\)\}/);
});
caso('o título conta quem ouve agora, e sem ninguém diz "Recently played"', () => {
  assert.match(LISTA, /\{aOuvirAgora \? `Listening now · \$\{aOuvirAgora\}` : 'Recently played'\}/);
});
caso('"Listen along" só para quem ouve agora: a Jam dele se tiver, senão segue-o (a porta do menu do botão direito)', () => {
  assert.match(LISTA, /\{a\.listening && <Pressable \{\.\.\.marcar\('ouvir-ja'\)\}/);
  assert.match(LISTA, /const jams = await jamsDosAmigos\(\)\.catch\(\(\) => new Map<string, string>\(\)\);\n  await ouvirComAmigo\(amigo, jams\.get\(amigo\.friendId\) \?\? null\);/);
});
caso('a pergunta das Jams é a partilhada com a Home (2 min), e só se faz ao carregar', () => {
  assert.match(LISTA, /import \{ jamsDosAmigos \} from '\.\.\/state\/jamsDosAmigos';/);
  assert.equal((LISTA.match(/jamsDosAmigos\(/g) ?? []).length, 1);
});
caso('o botão aparece com o rato no cartão ou com o foco lá dentro (CSS), e as barrinhas só mexem em CSS', () => {
  assert.match(CASCA, /\[data-dt~="cartao-ouvir"\]:hover \[data-dt~="ouvir-ja"\], \[data-dt~="cartao-ouvir"\]:focus-within \[data-dt~="ouvir-ja"\]\{ opacity: 1; transform: none; \}/);
  assert.match(CASCA, /\[data-dt~="eq"\] > \*\{ transform-origin: bottom; animation: dt-eq 1s ease-in-out infinite; \}/);
  assert.match(CASCA, /@keyframes dt-eq\{ 0%, 100%\{ transform: scaleY\(\.3\); \} 50%\{ transform: scaleY\(1\); \} \}/);
});

console.log('\nas conversas');
caso('sem o balão em cada linha: a linha abre a conversa, e só uma conversa antiga leva o lixo', () => {
  assert.ok(!/icon=\{oldContact \? 'trash-outline' : 'chatbubble-outline'\}/.test(LISTA));
  assert.match(LISTA, /\{oldContact && <SocialIconButton label=\{`Delete conversation with \$\{c\.nome\}`\} icon="trash-outline"/);
  assert.match(LISTA, /<Text accessibilityRole="header" style=\{styles\.sectionTitle\}>Conversations<\/Text>/);
});
caso('a linha acende com o rato, e o contador de não lidas continua', () => {
  assert.match(CASCA, /\[data-dt~="conversa"\]:hover\{ background-color: rgba\(233,234,238,\.05\); \}/);
  assert.match(LISTA, /\{count > 0 && <Unread count=\{count\}\/>\}/);
});
caso('a ordem por interação, o botão direito num amigo e a pré-visualização ficam como estavam', () => {
  assert.match(LISTA, /ordenarConversas</);
  assert.match(LISTA, /previaDaConversa\(preview, props\.myId/);
  assert.match(LISTA, /onContextMenu: \(e: any\) => \{ e\.preventDefault\(\); props\.onFriendMenu!/);
});
caso('nada de className nem de backdrop-filter', () => {
  for (const f of [LISTA, CAPA_PC]) {
    assert.ok(!/className\s*[=:]/.test(f.replace(/\/\*[\s\S]*?\*\//g, '')));
    assert.ok(!/backdrop-?[fF]ilter/.test(f));
  }
});

console.log('\no look da conversa no PC (a maquete)');
caso('o dia é uma pílula pequena em maiúsculas no PC, e o texto de sempre no iPhone', () => {
  assert.match(HUB, /const estiloDoSeparador=web\n\s+\?\{alignSelf:'center' as const,fontSize:11,[^}]*textTransform:'uppercase' as const[^}]*borderRadius:999[^}]*\}\n\s+:\{alignSelf:'center' as const,fontSize:12,fontWeight:'600' as const,color:colors\.textTertiary,marginBottom:8,marginTop:4\};/);
});
caso('o que escreves é um balão claro com letra escura, só no PC e só quando é só texto (sem música, playlist nem resposta)', () => {
  assert.match(HUB, /const claro=web&&minha&&!m\.trackData&&!m\.playlistId&&!cit;/);
  assert.match(HUB, /backgroundColor:claro\?colors\.text:\(minha\?tema\.soft:colors\.surface\),/);
  assert.match(HUB, /claro&&\{color:colors\.bg\}\]\}>\{m\.message\}<\/Text>/);
});
caso('os balões não passam dos 62 % no PC, e dos 92 % de sempre no iPhone', () => {
  assert.match(HUB, /maxWidth:web\?'62%':'92%'/);
});
caso('o cabeçalho da conversa tem "Start a Jam" (ou "Listen along" se ele está a ouvir), pela mesma porta do iPhone', () => {
  assert.match(HUB, /onPress=\{\(\)=>ouvirJuntosCom\(friend\)\}\n\s+style=\{\(\{pressed\}:any\)=>\[\{flexDirection:'row',alignItems:'center',gap:8,height:34/);
  assert.match(HUB, /\{friend\.currentlyPlaying\?'Listen along':'Start a Jam'\}/);
});
caso('o compositor no PC: o campo em pílula e o enviar redondo e branco com a seta; no iPhone o botão "Send" de sempre', () => {
  assert.match(HUB, /web&&\{borderRadius:22,minHeight:44,paddingHorizontal:18\}\]\} editable=\{!busy\}/);
  assert.match(HUB, /<Ionicons name="arrow-up" size=\{20\} color=\{colors\.bg\}\/><\/Pressable>\n\s+:<SocialButton primary disabled=\{busy\|\|!draft\.trim\(\)\} onPress=\{\(\)=>void send\(\)\}>Send<\/SocialButton>\)/);
});
caso('o painel da conversa é mais redondo, e o cartão de quem ouve leva a cor da capa (só enquanto ouve)', () => {
  assert.match(HUB, /borderColor:colors\.borderStrong,borderRadius:22,overflow:'hidden'/);
  assert.match(LISTA, /const cor = useCorDoAmbiente\(a\.listening \? cover : null\);/);
  assert.match(LISTA, /linear-gradient\(90deg, color-mix\(in oklab, \$\{cor\} 30%, transparent\), \$\{colors\.surface\} 75%\)/);
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
  assert.match(NAVEGADOR, /<SocialPage friendId=\{route\.friendId\} groupId=\{route\.groupId\} visible=\{!nowPlayingOpen && !jamOpen\} aoMenuDaFaixa=\{\(t\) => void more\(t\)\} \/>/);
  assert.match(PAGINA_PERFIL, /aoMenuDaFaixa=\{aoMenuDaFaixa\}\/>/);
});
caso('no Social, o cartão de quem ouve, a música de uma mensagem e as de um grupo abrem o menu novo', () => {
  assert.equal((HUB.match(/aoMenuDaFaixa\?aoMenuDaFaixa\(/g) ?? []).length, 3);
});

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1); }
console.log('\ntudo certo');
