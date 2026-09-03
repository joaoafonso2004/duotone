const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export function acceptsCubeSwipe(dx:number,dy:number){return Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.4;}
export function cubeDirection(open:boolean,dx:number){return (open?1:-1)*(dx<0?-1:1);}
export function cubeProgress(start:number,dx:number,size:number,direction:number){return clamp(start-dx/(size*direction));}
export function cubeDestination(start:number,dx:number,vx:number,size:number,direction:number){
  const distance=-dx/(size*direction),velocity=-vx/direction;
  return start===0?(distance>0.2||velocity>0.35):!(distance< -0.2||velocity< -0.35);
}
