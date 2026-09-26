// NativeImage uses BGRA bitmap bytes. Drawing locally avoids loading remote
// images or accepting renderer-provided image payloads in the main process.
const digits = {
  '0':['111','101','101','101','111'], '1':['010','110','010','010','111'],
  '2':['111','001','111','100','111'], '3':['111','001','111','001','111'],
  '4':['101','101','111','001','001'], '5':['111','100','111','001','111'],
  '6':['111','100','111','101','111'], '7':['111','001','010','010','010'],
  '8':['111','101','111','101','111'], '9':['111','101','111','001','111'],
  '+':['000','010','111','010','000'],
};
function messageBadge(count) {
  const label = count > 99 ? '99+' : String(count);
  const size = 32, scale = label.length > 2 ? 2 : 3;
  const bitmap = Buffer.alloc(size * size * 4);
  const pixel = (x,y,b,g,r,a=255) => { const i=(y*size+x)*4; bitmap[i]=b; bitmap[i+1]=g; bitmap[i+2]=r; bitmap[i+3]=a; };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const alpha=Math.round(255*Math.max(0,Math.min(1,16-Math.hypot(x-15.5,y-15.5))));
    if(alpha)pixel(x,y,Math.round(72*alpha/255),Math.round(64*alpha/255),Math.round(225*alpha/255),alpha);
  }
  const width=(label.length*4-1)*scale, left=Math.floor((size-width)/2), top=Math.floor((size-5*scale)/2);
  [...label].forEach((c,n)=>digits[c].forEach((row,y)=>[...row].forEach((on,x)=>{
    if(on==='1')for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++)pixel(left+(n*4+x)*scale+dx,top+y*scale+dy,255,255,255);
  })));
  return { bitmap, size, label };
}
const lastCounts = new WeakMap();
function setMessageAttention(win, nativeImage, count, attention, platform) {
  if (!Number.isSafeInteger(count) || count < 0 || typeof attention !== 'boolean') return;
  if (platform === 'win32' && lastCounts.get(win) !== count) {
    const badge = count ? messageBadge(count) : null;
    win.setOverlayIcon(badge ? nativeImage.createFromBitmap(badge.bitmap,{width:badge.size,height:badge.size}) : null,
      count ? `${count} unread messages` : '');
    lastCounts.set(win, count);
  }
  if (!count || win.isFocused()) win.flashFrame(false);
  else if (attention) win.flashFrame(true);
}
module.exports = { messageBadge, setMessageAttention };
