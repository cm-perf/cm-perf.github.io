import {Resvg} from '@resvg/resvg-js';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const xml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fontDir=fileURLToPath(new URL('./fonts/',import.meta.url));
const width = text => [...text].reduce((n,c)=>n+(/[MW@%]/.test(c)? .95:/[ilI.,'!:;]/.test(c)? .3:/\s/.test(c)? .3:/[A-Z0-9]/.test(c)? .7:/[^\x00-\x7F]/.test(c)? 1:.58),0);
function wrap(text,limit){
  const lines=[];let current='';
  for(const word of text.split(/\s+/)){
    if(current && width(current+' '+word)>limit){lines.push(current);current='';}
    for(const char of word){
      if(width(current+char)>limit){lines.push(current);current='';}
      current+=char;
    }
    current+=' ';
  }
  if(current.trim())lines.push(current.trim());
  return lines.map(line=>line.trim());
}

export async function createPostImage(root,out,post){
  let size=64,lines=wrap(post.title,650/size);
  while(lines.length>5 && size>44){size-=4;lines=wrap(post.title,650/size);}
  if(lines.length>5){lines=lines.slice(0,5);lines[4]=lines[4].slice(0,-3)+'…';}
  let photo='';
  if(post.image){
    const bytes=await readFile(path.join(root,post.image.slice(1)));
    const ext=path.extname(post.image).toLowerCase();
    const mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'}[ext];
    if(!mime)throw Error('Unsupported OpenGraph cover image: '+ext);
    photo=`<image x="760" y="0" width="440" height="630" preserveAspectRatio="xMidYMax slice" href="data:${mime};base64,${bytes.toString('base64')}"/><rect x="760" width="4" height="630" fill="#f26a21"/>`;
  }
  const title=lines.map((line,i)=>`<text x="64" y="${222+i*(size*1.15)}" font-size="${size}" font-weight="700" fill="#f2f2f0">${xml(line)}</text>`).join('');
  const tag=(post.tag||'Workshop notes').toUpperCase().slice(0,45);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#0a0a0b"/>${photo}<g font-family="Liberation Sans"><text x="64" y="79" font-size="27" font-weight="700" fill="#f2f2f0">CM <tspan fill="#f26a21">PERFORMANCE</tspan></text><text x="64" y="144" font-size="20" fill="#f26a21" letter-spacing="2">${xml(tag)}</text>${title}<path d="M64 548 H696" stroke="#363639"/><text x="64" y="589" font-size="22" fill="#aaaab0">cmperf.uk/blog</text><text x="696" y="589" font-size="20" text-anchor="end" fill="#aaaab0">${xml(post.date)}</text></g></svg>`;
  const hash=createHash('sha256').update(svg).digest('hex').slice(0,12);
  const url=`/assets/blog/${post.slug}-${hash}.png`;
  await mkdir(path.join(out,'assets/blog'),{recursive:true});
  const png=new Resvg(svg,{font:{loadSystemFonts:false,fontFiles:[path.join(fontDir,'LiberationSans-Regular.ttf'),path.join(fontDir,'LiberationSans-Bold.ttf')]}}).render().asPng();
  await writeFile(path.join(out,url.slice(1)),png);
  return url;
}
