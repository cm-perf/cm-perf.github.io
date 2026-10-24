// Publish only web assets. Keep source readable and minify the output, including inline scripts.
import {transform} from 'esbuild';
import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile,copyFile,mkdir,rm} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'dist');
const extensions=new Set(['.html','.js','.css','.json','.xml','.txt','.png','.jpg','.jpeg','.webp','.svg','.ico','.mp4','.webm','.woff','.woff2','.webmanifest']);
const ignored=new Set(['.git','.github','.cloudflare','node_modules','dist','tools','tests']);
let before=0,after=0,count=0;
async function minify(input,sourcefile){
 const {code}=await transform(input,{loader:'js',minify:true,legalComments:'inline',target:'es2020',sourcefile});
 before+=Buffer.byteLength(input);after+=Buffer.byteLength(code);count++;return code;
}
async function html(input,name){
 const matches=[...input.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
 for(const m of matches.reverse()){
  const type=/\btype\s*=\s*["']([^"']+)["']/i.exec(m[1])?.[1];
  if(/\bsrc\s*=/i.test(m[1]) || !m[2].trim() || (type && !['module','text/javascript','application/javascript'].includes(type)))continue;
  const code=await minify(m[2],name);
  input=input.slice(0,m.index)+`<script${m[1]}>${code}</script>`+input.slice(m.index+m[0].length);
 }
 return input;
}
async function visit(dir){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  if(ignored.has(entry.name)||entry.name.startsWith('.')&&entry.name!=='.nojekyll'||['package.json','package-lock.json'].includes(entry.name))continue;
  const src=resolve(dir,entry.name),name=relative(root,src),dest=resolve(out,name);
  if(entry.isDirectory()){await visit(src);continue;}
  if(!entry.isFile()||(!extensions.has(extname(entry.name))&&!['CNAME','.nojekyll'].includes(entry.name)))continue;
  await mkdir(resolve(dest,'..'),{recursive:true});
  if(entry.name.endsWith('.js'))await writeFile(dest,await minify(await readFile(src,'utf8'),name));
  else if(entry.name.endsWith('.html'))await writeFile(dest,await html(await readFile(src,'utf8'),name));
  else await copyFile(src,dest);
 }
}
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await visit(root);
// Bind each page to its exact script bytes so a warm browser cannot reuse an
// older order form controller after the HTML changes.
async function versionScripts(dir){
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const file=resolve(dir,entry.name);
  if(entry.isDirectory()){await versionScripts(file);continue;}
  if(!entry.name.endsWith('.html'))continue;
  let page=await readFile(file,'utf8');
  const scripts=[...page.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)];
  for(const match of scripts){
   const src=match[1];
   if(/^(?:[a-z]+:|\/\/)/i.test(src))continue;
   const pathname=src.split(/[?#]/)[0];
   const asset=resolve(pathname.startsWith('/')?out:resolve(file,'..'),pathname.replace(/^\//,''));
   if(!asset.startsWith(out+'/'))throw new Error('Script outside publish directory');
   const hash=createHash('sha256').update(await readFile(asset)).digest('hex').slice(0,16);
   page=page.replace(match[0],match[0].replace(src,pathname+'?v='+hash));
  }
  await writeFile(file,page);
 }
}
await versionScripts(out);
console.log(`Website JavaScript: ${before} -> ${after} bytes (${count} scripts)`);
