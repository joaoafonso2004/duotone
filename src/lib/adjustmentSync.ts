import {fundirAjustes,type AjusteDaFaixa,type MemoriaDeAjustes} from './equalizer';
export type AdjustmentSnapshot={values:MemoriaDeAjustes;pending:MemoriaDeAjustes};
export type AdjustmentStatus='loading'|'local'|'pending'|'syncing'|'saved'|'error';
type Dependencies={readLocal:()=>Promise<AdjustmentSnapshot>;writeLocal:(s:AdjustmentSnapshot)=>Promise<void>;
  readRemote:()=>Promise<MemoriaDeAjustes>;writeRemote:(key:string,value:AjusteDaFaixa)=>Promise<void>;
  apply:(values:MemoriaDeAjustes)=>void;status:(status:AdjustmentStatus)=>void};

/** Fila durável por conta. As respostas antigas nunca confirmam edições novas. */
export class AdjustmentSync {
  private values:MemoriaDeAjustes={};
  private pending:MemoriaDeAjustes={};
  private stopped=false;
  private writing=Promise.resolve();
  private syncing:Promise<void>|null=null;
  private ready:Promise<void>;
  private confirmed=false;
  constructor(private deps:Dependencies){this.ready=this.hydrate();}
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
      this.values=fundirAjustes(local.values,this.values);
      this.pending={...local.pending,...this.pending};
      this.publish();await this.persist();
    }catch{if(!this.stopped)this.deps.status('error');}
  }
  private publish(){if(!this.stopped){this.deps.apply(this.values);this.deps.status(Object.keys(this.pending).length?'pending':this.confirmed?'saved':'local');}}
  private persist(){
    const snapshot={values:{...this.values},pending:{...this.pending}};
    this.writing=this.writing.catch(()=>{}).then(()=>this.deps.writeLocal(snapshot));
    return this.writing;
  }
  edit(key:string,value:AjusteDaFaixa){
    if(this.stopped)return;
    // Relógio monotónico local, inclusive ao arrastar várias vezes no mesmo ms.
    const next={...value,visto:Math.max(value.visto,(this.values[key]?.visto??0)+1)};
    this.values=fundirAjustes(this.values,{[key]:next});this.pending[key]=next;this.publish();
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
      this.values=fundirAjustes(this.values,remote);
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
        this.values=fundirAjustes(this.values,confirmed);
        this.deps.apply(this.values);await this.persist();
      }
      this.confirmed=true;
      if(!this.stopped)this.deps.status(Object.keys(this.pending).length?'pending':'saved');
    }catch{if(!this.stopped)this.deps.status('error');}
  }
  stop(){this.stopped=true;}
}
