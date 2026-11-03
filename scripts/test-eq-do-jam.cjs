// Transporte e controlador reais. Só relógio, socket e stores são duplos.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const flush=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};
function ambiente(){
  let agora=10000,id=0;const timers=new Map();
  return {async avancar(ms){const fim=agora+ms;for(;;){const t=[...timers].filter(([,v])=>v.em<=fim).sort((a,b)=>a[1].em-b[1].em)[0];if(!t)break;agora=t[1].em;timers.delete(t[0]);t[1].fn();await flush();}agora=fim;await flush();},
    carregar(file,mocks={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
      vm.runInNewContext(code,{module,exports:module.exports,Date:{now:()=>agora},setTimeout:(fn,ms)=>{const n=++id;timers.set(n,{fn,em:agora+ms});return n;},clearTimeout:n=>timers.delete(n),require:n=>{assert.ok(n in mocks,'Import sem duplo: '+n);return mocks[n];}});return module.exports;}};
}
function loja(inicial){let s=inicial;const ouvintes=new Set();return{getState:()=>s,subscribe:fn=>{ouvintes.add(fn);return()=>ouvintes.delete(fn);},mudar:p=>{const antes=s;s={...s,...p};for(const fn of [...ouvintes])fn(s,antes);},ouvintes};}
function rede(){const canais=[],enviados=[];let online=true;
  const sync=t=>{for(const c of canais)if(c.topic===t&&c.state==='joined')c.handlers['presence:sync']?.();};
  return{canais,enviados,online:v=>{online=v;},sync,cliente:()=>({realtime:{isConnected:()=>online},
    channel(topic,options){const c={topic,options,state:'joined',tracked:false,handlers:{},
      on(tipo,filtro,fn){c.handlers[tipo+':'+filtro.event]=fn;return c;},subscribe(fn){c.status=fn;fn('SUBSCRIBED');return c;},
      presenceState:()=>Object.fromEntries(canais.filter(x=>x.topic===topic&&x.tracked&&x.state==='joined').map((x,i)=>[i,[{}]])),
      async track(){assert.equal(options.config.presence.enabled,true);c.tracked=true;sync(topic);},
      async send(p){assert.equal(online,true,'não há fallback HTTP');enviados.push(p);for(const x of [...canais])if(x!==c&&x.topic===topic&&x.state==='joined')x.handlers['broadcast:'+p.event]?.(p);},
    };canais.push(c);return c;},async removeChannel(c){c.state='closed';c.tracked=false;sync(c.topic);}})};
}
const sala={id:'jam',hostId:'host',eqEmissao:'ativacao-1',eqDispositivo:'pc',eqPartilhado:true,track:{source:'youtube',sourceId:'a'}};
const som=(id='a',g=3)=>({faixa:'youtube:'+id,ganhos:Array(10).fill(g)});
const transporte=(a,r)=>a.carregar('src/lib/eqDoJamAoVivo.ts',{'expo-crypto':{randomUUID:()=>String(Math.random())},'./supabase':{supabase:r.cliente()},'./equalizer':{BANDAS:Array(10),GANHO_MAXIMO:20}});
async function principal(){
  {
    const a=ambiente(),r=rede(),t=transporte(a,r);let actual=som(),recebido,quedas=0;
    const dono=t.emitirEqDoJam(sala,()=>actual);
    for(let i=0;i<100;i++)dono.mudou();assert.equal(r.enviados.length,0,'sozinho não transmite');
    const parar=t.ouvirEqDoJam(sala,s=>{recebido=s;},()=>quedas++);await flush();
    assert.equal(recebido.ganhos[0],3,'quem entra a meio recebe já a curva');
    assert.ok(r.canais.every(c=>c.options.config.private===true));
    const antes=r.enviados.length;
    for(let i=0;i<100;i++){actual=som('a',i/10);dono.mudou();await a.avancar(10);}
    await a.avancar(200);assert.equal(recebido.ganhos[0],9.9);assert.ok(r.enviados.length-antes<=6,'máximo cinco envios por segundo, com o valor final');
    const receptor=r.canais[1],ultimo=r.enviados.at(-1),n=r.enviados.length;
    receptor.handlers['broadcast:eq']({...ultimo,payload:{...ultimo.payload,estado:som('a',-7)}});
    assert.equal(recebido.ganhos[0],9.9,'ignora duplicados/atrasados');
    receptor.handlers['broadcast:eq']({payload:{v:1,emissor:'invalido',seq:1,estado:{faixa:'youtube:a',ganhos:[Infinity]}}});
    assert.equal(recebido.ganhos[0],9.9);
    r.online(false);dono.mudou();await a.avancar(1000);assert.equal(r.enviados.length,n,'socket caído não envia HTTP');
    receptor.status('CHANNEL_ERROR');assert.equal(quedas,1);r.online(true);receptor.status('SUBSCRIBED');await a.avancar(200);
    assert.equal(recebido.ganhos[0],9.9,'religar pede outro retrato');
    parar();const semOuvintes=r.enviados.length;dono.mudou();await a.avancar(1000);assert.equal(r.enviados.length,semOuvintes);
    const pararNovo=t.ouvirEqDoJam({...sala,eqEmissao:'ativacao-2'},()=>{throw Error('Pacote de outra ativação');},()=>{});await flush();
    dono.mudou();await a.avancar(200);pararNovo();dono.parar();
    for(const p of [undefined,{}, {faixa:'a',ganhos:Array(10).fill(NaN)}, {faixa:'a',ganhos:Array(10).fill(21)}])assert.equal(t.lerEqDoJam(p),undefined);
  }
  {
    const a=ambiente(),r=rede();
    function participante(eu,dispositivo,g=0){
      const jam=loja({sessao:{...sala},euId:eu});
      let player;
      player=loja({current:{source:'youtube',sourceId:'a'},eqGanhos:Array(10).fill(g),eqDaJam:null,eqDaJamAtivo:false,
        _aplicarEqDaJam:(eq,activo)=>{const p=player.getState();if(p.eqDaJam===eq&&p.eqDaJamAtivo===activo)return;player.mudar({eqDaJam:eq,eqDaJamAtivo:activo});}});
      const t=transporte(a,r),m=a.carregar('src/lib/eqDoJam.ts',{'../state/player':{usePlayer:player,ganhosEmVigor:p=>p.eqDaJam??p.eqGanhos},'../state/ouvirJuntos':{useOuvirJuntos:jam},'./eqDoJamAoVivo':t});
      return{jam,player,parar:m.ligarEqualizadorDaJam(dispositivo),ligar:()=>m.ligarEqualizadorDaJam(dispositivo)};
    }
    const host=participante('host','pc',4),guest=participante('guest','iphone',1);await a.avancar(200);
    assert.equal(guest.player.getState().eqDaJam[0],4);
    const envios=r.enviados.length;guest.player.mudar({eqGanhos:Array(10).fill(7)});await a.avancar(200);
    assert.equal(r.enviados.length,envios,'o convidado não retransmite o próprio EQ');
    host.player.mudar({eqGanhos:Array(10).fill(6)});await a.avancar(200);assert.equal(guest.player.getState().eqDaJam[0],6);
    const outroAparelho=participante('host','iphone',9);await a.avancar(200);
    assert.equal(outroAparelho.player.getState().eqDaJam[0],6,'o iPhone do dono recebe, não substitui o PC escolhido');
    assert.equal(host.player.getState().eqDaJamAtivo,false);
    // O pacote da faixa nova pode chegar antes da linha da sessão e do áudio.
    host.jam.mudar({sessao:{...sala,track:{source:'youtube',sourceId:'b'}}});
    host.player.mudar({current:{source:'youtube',sourceId:'b'},eqGanhos:Array(10).fill(2)});await a.avancar(200);
    assert.equal(guest.player.getState().eqDaJam,null,'não aplica à faixa anterior');
    guest.jam.mudar({sessao:{...sala,track:{source:'youtube',sourceId:'b'}}});
    guest.player.mudar({current:{source:'youtube',sourceId:'b'}});
    assert.equal(guest.player.getState().eqDaJam[0],2,'usa o retrato quando a faixa correspondente chega');
    guest.jam.mudar({sessao:{...sala,eqPartilhado:false}});
    const anterior=guest.player.getState().eqDaJam;
    host.player.mudar({eqGanhos:Array(10).fill(8)});await a.avancar(200);
    assert.equal(guest.player.getState().eqDaJam,anterior,'ignora pacotes assim que o modo deixa de ser válido');
    guest.parar();assert.equal(guest.player.getState().eqDaJam,null);assert.equal(guest.player.getState().eqDaJamAtivo,false);
    assert.equal(guest.player.getState().eqGanhos[0],7,'a curva pessoal foi conservada');
    assert.equal(guest.player.ouvintes.size+guest.jam.ouvintes.size,0,'sair larga todas as subscrições');
    outroAparelho.parar();host.parar();
  }
  console.log('Jam EQ ao vivo: entrada/religação, 5 envios/s, sem HTTP/polling, sem eco, aparelho escolhido, faixas e reposição passaram.');
}
principal().catch(e=>{console.error(e);process.exitCode=1;});
