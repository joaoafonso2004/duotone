import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function carregar(path,extras={}){
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,...extras});return module.exports;
}
const {estadoDaPresenca,ultimaAtividade}=carregar('../src/lib/socialPresence.ts');
const now=Date.now(),iso=n=>new Date(now+n).toISOString();
const p={last_seen_at:iso(-60000),online_until:iso(5000),playing_until:iso(1000),currently_playing:{title:'Teste'}};
assert.equal(estadoDaPresenca(p,now).track.title,'Teste');
assert.equal(estadoDaPresenca(p,now+2000).track,null);
assert.equal(estadoDaPresenca(p,now+2000).online,true);
assert.equal(estadoDaPresenca(p,now+6000).online,false);
assert.equal(estadoDaPresenca({...p,online_until:'inválido'},now).online,false);
assert.equal(ultimaAtividade(undefined,now),'Last seen unknown');
assert.match(ultimaAtividade(iso(-120000),now),/2 min/);
const {imageCrop}=carregar('../src/lib/profileImageCrop.ts');
const top=imageCrop(100,400,1,0.5,0),bottom=imageCrop(100,400,1,0.5,1);
assert.equal(top.originY,0);assert.equal(bottom.originY,300);assert.equal(bottom.height,100);
assert.equal(imageCrop(1600,1200,8/3,0.5,1).originY,600);
assert.throws(()=>imageCrop(0,2,1));
let time=0,tick,closed=0;
const volumes=[];
let state={current:{id:'a'},closing:false,closeGain:1,volume:37,_yt:{setVolume:v=>volumes.push(v)},close:async()=>{closed++;state={...state,current:null,closing:false,closeGain:1};}};
const store={getState:()=>state,setState:s=>{state={...state,...s};}};
const {closePlayerSmoothly,confirmaSwipe}=carregar('../src/lib/closePlayer.ts',{
  require:()=>({usePlayer:store}),Date:{now:()=>time},setInterval:f=>(tick=f,1),clearInterval:()=>{tick=null;},
});
assert.equal(confirmaSwipe(-200,0,2,300),false);
assert.equal(confirmaSwipe(15,0,2,300),false);
assert.equal(confirmaSwipe(150,180,1,300),false);
assert.equal(confirmaSwipe(120,3,0.2,300),true);
assert.equal(confirmaSwipe(40,0,1,300),true);
const closing=closePlayerSmoothly();assert.equal(closePlayerSmoothly(),closing);
time=150;tick();assert.equal(state.closeGain,0.5);assert.equal(volumes.at(-1),18.5);assert.equal(closed,0);
time=301;tick();await closing;assert.equal(volumes.at(-1),0);assert.equal(closed,1);assert.equal(state.volume,37);
state={...state,current:{id:'b'},volume:0};time=400;
const muted=closePlayerSmoothly();time=550;tick();assert.equal(volumes.at(-1),0);time=701;tick();await muted;
state={...state,current:{id:'c'},volume:64};time=800;
const cancel=closePlayerSmoothly();time=900;tick();state={...state,current:{id:'d'},closing:false,closeGain:1};tick();await cancel;
assert.equal(state.current.id,'d');assert.equal(volumes.at(-1),64);assert.equal(closed,2);
// ---------------------------------------------------------------------------
// Fundir os ajustes por faixa entre aparelhos.
//
// O equalizador e a velocidade de cada musica viviam so no aparelho: o PC e o
// telemovel tinham memorias separadas para as mesmas faixas. Ao juntar as duas
// e o carimbo `visto` que decide, POR FAIXA -- nunca campo a campo, senao
// ficava a velocidade de um aparelho com o equalizador do outro, que e uma
// combinacao que ninguem escolheu.
// ---------------------------------------------------------------------------
// Arrastar o recorte das imagens do perfil.
//
// Arrastar move a IMAGEM e nao a moldura: puxar para a direita traz para a
// vista o que estava a esquerda. Dai o foco andar ao contrario do dedo.
const {arrastarFoco,RACIO_DA_CAPA}=carregar('../src/lib/profileImageCrop.ts');
// Uma imagem 2000x1000 recortada a 8/3 da 2000x750: sobram 250px na vertical.
const c=imageCrop(2000,1000,RACIO_DA_CAPA,0.5,0.5);
assert.equal(c.width,2000);assert.equal(c.height,750);
// Metade do espaco livre, a escala 1, e meio caminho do foco.
assert.equal(arrastarFoco(0.5,-125,1,250),1);
assert.equal(arrastarFoco(0.5,125,1,250),0);
// Nunca sai de [0,1], por muito que se arraste.
assert.equal(arrastarFoco(0.5,-99999,1,250),1);
assert.equal(arrastarFoco(0.5,99999,1,250),0);
// A escala do ecra conta: a moldura mostrada e menor que a imagem real.
assert.equal(arrastarFoco(0.5,-50,0.4,250),1);
// Sem espaco livre nesse eixo nao ha nada a ajustar -- e nao da NaN.
assert.equal(arrastarFoco(0.5,-100,1,0),0.5);
assert.equal(arrastarFoco(0.5,-100,0,250),0.5);
const {fundirAjustes,MAX_FAIXAS}=carregar('../src/lib/equalizer.ts');
const aj=(visto,rate,ganho)=>({rate,ganhos:ganho===null?null:[ganho,0,0,0,0,0,0,0,0,0],visto});

// O que so o servidor tem chega ca.
assert.equal(fundirAjustes({},{a:aj(10,1.25,null)}).a.rate,1.25);
// O que so este aparelho tem fica.
assert.equal(fundirAjustes({b:aj(10,null,6)},{}).b.ganhos[0],6);
// Mais recente ganha, venha de onde vier.
assert.equal(fundirAjustes({c:aj(10,1.5,null)},{c:aj(20,0.75,null)}).c.rate,0.75);
assert.equal(fundirAjustes({c:aj(30,1.5,null)},{c:aj(20,0.75,null)}).c.rate,1.5);
// Empate fica com o local: quem esta ao teclado mandou por ultimo.
assert.equal(fundirAjustes({d:aj(10,1.5,null)},{d:aj(10,0.75,null)}).d.rate,1.5);
// A faixa vem inteira, nao meia de cada: o rate e os ganhos andam juntos.
const fundida=fundirAjustes({e:aj(10,1.5,9)},{e:aj(20,0.75,3)}).e;
assert.equal(fundida.rate,0.75);assert.equal(fundida.ganhos[0],3);
// E o teto continua a valer depois de juntar os dois lados.
const muitos=(inicio,n)=>Object.fromEntries(Array.from({length:n},(_,i)=>['k'+(inicio+i),aj(inicio+i,1.5,null)]));
assert.equal(Object.keys(fundirAjustes(muitos(0,MAX_FAIXAS),muitos(MAX_FAIXAS,MAX_FAIXAS))).length,MAX_FAIXAS);
console.log('Presença, expiração, recorte, direção do gesto, fade, mute, cancelamento, fusão de ajustes e arrasto do recorte passaram.');
