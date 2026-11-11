import {fundirAjustes,type AjusteDaFaixa} from './equalizer';
export type AdjustmentSnapshot<V extends {visto:number}=AjusteDaFaixa>={values:Record<string,V>;pending:Record<string,V>};
export type AdjustmentStatus='loading'|'local'|'pending'|'syncing'|'saved'|'error';
type Dependencies<V extends {visto:number}>={readLocal:()=>Promise<AdjustmentSnapshot<V>>;writeLocal:(s:AdjustmentSnapshot<V>)=>Promise<void>;
  readRemote:()=>Promise<Record<string,V>>;writeRemote:(key:string,value:V)=>Promise<void>;
  apply:(values:Record<string,V>)=>void;status:(status:AdjustmentStatus)=>void;
  /** Como juntar duas memórias. Por omissão a dos ajustes por faixa; os presets
   * do equalizador (lib/presetsDoEqualizador.ts) trazem a sua -- a mesma regra,
   * o mais recente ganha, sem o limite de faixas. */
  fundir?:(local:Record<string,V>,remoto:Record<string,V>)=>Record<string,V>};

/** Fila durável por conta. As respostas antigas nunca confirmam edições novas. */
export class AdjustmentSync<V extends {visto:number}=AjusteDaFaixa> {
  private values:Record<string,V>={};
  private pending:Record<string,V>={};
  private stopped=false;
  private writing=Promise.resolve();
  private syncing:Promise<void>|null=null;
  private ready:Promise<void>;
  private confirmed=false;
  private fundir:(local:Record<string,V>,remoto:Record<string,V>)=>Record<string,V>;
  constructor(private deps:Dependencies<V>){
    this.fundir=deps.fundir??(fundirAjustes as unknown as (a:Record<string,V>,b:Record<string,V>)=>Record<string,V>);
    this.ready=this.hydrate();
  }
  private async hydrate(){
    try{
      const local=await this.deps.readLocal();if(this.stopped)return;
      // Uma edição já feita neste arranque vence a cache que ainda estava a ler.
      for(const [key,edit] of Object.entries(this.pending)){
        if((local.values[key]?.visto??0)>=edit.visto){
          this.pending[key]={...edit,visto:local.values[key].visto+1};
          this.values[key]=this.pending[key];
        }
      }
      this.values=this.fundir(local.values,this.values);
      this.pending={...local.pending,...this.pending};
      this.publish();await this.persist();
    }catch{if(!this.stopped)this.deps.status('error');}
  }
  private publish(){if(!this.stopped){this.deps.apply(this.values);this.deps.status(Object.keys(this.pending).length?'pending':this.confirmed?'saved':'local');}}
  private persist(){
    const snapshot:AdjustmentSnapshot<V>={values:{...this.values},pending:{...this.pending}};
    this.writing=this.writing.catch(()=>{}).then(()=>this.deps.writeLocal(snapshot));
    return this.writing;
  }
  /**
   * O aparelho já tem esta versão (ou uma mais recente) da linha: é o eco da
   * própria escrita a voltar pelo Realtime, e reler a tabela inteira por causa
   * dele era pagar duas vezes a mesma edição (30/9, egress). O `seen_at` da
   * linha é o `visto` de quem a escreveu, por isso comparar é exato.
   */
  jaSabe(key:string,visto:number):boolean{return Number.isFinite(visto)&&(this.values[key]?.visto??0)>=visto;}
  /**
   * Linhas que chegaram sem se pedir (11/11): o aviso do Realtime já traz a
   * linha nova, e lê-la outra vez era um pedido por cada edição de outro aparelho.
   * A mesma regra da leitura: o mais recente ganha.
   */
  receber(remoto:Record<string,V>){
    if(this.stopped)return;
    void this.ready.then(()=>{
      if(this.stopped)return;
      this.values=this.fundir(this.values,remoto);
      for(const [key,edit] of Object.entries(this.pending))if((remoto[key]?.visto??0)>edit.visto)delete this.pending[key];
      this.publish();return this.persist();
    }).catch(()=>{if(!this.stopped)this.deps.status('error');});
  }
  edit(key:string,value:V){
    if(this.stopped)return;
    // Relógio monotónico local, inclusive ao arrastar várias vezes no mesmo ms.
    const next={...value,visto:Math.max(value.visto,(this.values[key]?.visto??0)+1)};
    this.values=this.fundir(this.values,{[key]:next});this.pending[key]=next;this.publish();
    void this.ready.then(()=>this.persist()).catch(()=>{if(!this.stopped)this.deps.status('error');});
  }
  async sync():Promise<void>{
    await this.ready;if(this.stopped)return;
    if(this.syncing)return this.syncing;
    this.syncing=this.flush().finally(()=>{this.syncing=null;});return this.syncing;
  }
  private async flush(){
    try{
      this.deps.status('syncing');
      const remote=await this.deps.readRemote();if(this.stopped)return;
      this.values=this.fundir(this.values,remote);
      for(const [key,edit] of Object.entries(this.pending))if((remote[key]?.visto??0)>edit.visto)delete this.pending[key];
      this.deps.apply(this.values);await this.persist();
      // Edições feitas durante a escrita entram na passagem seguinte.
      let wrote=false;
      while(!this.stopped&&Object.keys(this.pending).length){
        const batch=Object.entries(this.pending);
        for(const [key,edit] of batch){
          if(this.stopped)return;
          await this.deps.writeRemote(key,edit);if(this.stopped)return;
          wrote=true;
          if(this.pending[key]?.visto===edit.visto)delete this.pending[key];
          await this.persist();
        }
      }
      if(wrote){
        const confirmed=await this.deps.readRemote();if(this.stopped)return;
        this.values=this.fundir(this.values,confirmed);
        this.deps.apply(this.values);await this.persist();
      }
      this.confirmed=true;
      if(!this.stopped)this.deps.status(Object.keys(this.pending).length?'pending':'saved');
    }catch{if(!this.stopped)this.deps.status('error');}
  }
  stop(){this.stopped=true;}
}

/**
 * Quando é que a leitura de recuperação vale a pena (30/9).
 *
 * Com o Realtime ligado as mudanças chegam sozinhas, e reler a tabela inteira
 * de dois em dois minutos -- e a cada foco da janela do PC -- era egress sem
 * nada de novo. Com ele, relê-se só passada a `janelaMs`; sem ele, sempre.
 */
export function precisaDeRecuperar(aoVivo:boolean,ultimaLeitura:number,agora:number,janelaMs:number):boolean{
  return !aoVivo||agora-ultimaLeitura>=janelaMs;
}

/** A tabela inteira relê-se ao arrancar e passado isto; entre elas, só o que mudou. */
export const LEITURA_INTEIRA_MS=6*60*60_000;
/**
 * O que mudou pede-se desde a leitura anterior MENOS isto: o `seen_at` é o
 * relógio de quem editou, e um aparelho com o relógio atrasado, ou que gravou
 * sem rede e só enviou depois, escreve uma hora mais antiga. Uma edição mais
 * atrasada do que a folga chega na leitura inteira seguinte.
 */
export const FOLGA_DA_LEITURA_MS=60*60_000;

/**
 * Desde quando ler (11/11, egress). `null` é a tabela inteira: a primeira
 * leitura, e a primeira passadas `LEITURA_INTEIRA_MS` desde a última inteira.
 */
export function desdeQuandoLer(ultimaInteira:number,ultimaLeitura:number,agora:number):number|null{
  if(!(ultimaInteira>0)||!(ultimaLeitura>0)||agora-ultimaInteira>=LEITURA_INTEIRA_MS||ultimaInteira>agora)return null;
  return Math.min(ultimaLeitura,agora)-FOLGA_DA_LEITURA_MS;
}
