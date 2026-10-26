import {readFile, readdir, mkdir, writeFile, access} from 'node:fs/promises';
import path from 'node:path';
import {Marked} from 'marked';
import hljs from 'highlight.js';
import {parse} from 'yaml';
import {createPostImage} from './blog-og.mjs';

const origin = 'https://cmperf.uk';
export const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeURL(value) {
  const url = String(value).trim();
  if (/[\u0000-\u0020\\]/.test(url)) return null;
  return /^(https?:\/\/|mailto:|#[^/]|\/(?!\/))/i.test(url) ? url : null;
}
const markdown = new Marked({gfm:true, renderer:{
  html({text}) { return escape(text); },
  code({text,lang}) {
    const language=(lang || '').trim().split(/\s+/)[0].toLowerCase();
    const supported=language && hljs.getLanguage(language);
    const highlighted=supported ? hljs.highlight(text,{language,ignoreIllegals:true}).value : escape(text);
    return `<pre><code class="hljs${supported ? ` language-${escape(language)}` : ''}">${highlighted}</code></pre>\n`;
  },
  link({href,title,tokens}) {
    const text = this.parser.parseInline(tokens), url = safeURL(href);
    return url ? `<a href="${escape(url)}"${title ? ` title="${escape(title)}"` : ''}>${text}</a>` : text;
  },
  image({href,title,text}) {
    const url = safeURL(href);
    return url && !url.startsWith('mailto:') ? `<img src="${escape(url)}" alt="${escape(text)}" loading="lazy"${title ? ` title="${escape(title)}"` : ''}>` : escape(text);
  },
}});

export function parsePost(source, filename) {
  const slug = filename.replace(/\.md$/, '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw Error(`${filename}: use a lowercase, hyphenated filename`);
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(source);
  if (!match) throw Error(`${filename}: missing YAML front matter or article body`);
  const meta = parse(match[1], {uniqueKeys:true});
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw Error(`${filename}: invalid front matter`);
  for (const key of ['title','date','description']) if (typeof meta[key] !== 'string' || !meta[key].trim()) throw Error(`${filename}: ${key} must be a nonempty string`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date) || !Number.isFinite(Date.parse(meta.date)) || new Date(meta.date).toISOString().slice(0,10) !== meta.date) throw Error(`${filename}: invalid date`);
  if (meta.draft != null && typeof meta.draft !== 'boolean') throw Error(`${filename}: draft must be true or false`);
  for (const key of ['tag','image','imageAlt','imageCaption']) if (meta[key] != null && typeof meta[key] !== 'string') throw Error(`${filename}: ${key} must be text`);
  if (meta.readerCodes != null && (!Array.isArray(meta.readerCodes) || meta.readerCodes.length !== 5 || new Set(meta.readerCodes).size !== 5 || meta.readerCodes.some(code=>typeof code !== 'string' || !/^[A-Z0-9]{5,40}$/.test(code)))) throw Error(`${filename}: readerCodes must contain five unique promotion codes`);
  if (meta.readerCodes && (typeof meta.readerCheckout !== 'string' || !/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9]+$/.test(meta.readerCheckout))) throw Error(`${filename}: readerCheckout must be a Stripe Payment Link`);
  if (meta.image && (!/^\/assets\/[a-zA-Z0-9_./-]+$/.test(meta.image) || meta.image.includes('..') || !meta.imageAlt?.trim())) throw Error(`${filename}: image must be an /assets/ path with imageAlt`);
  let hasPageHeading=false;
  markdown.walkTokens(markdown.lexer(match[2]),token=>{if(token.type==='heading' && token.depth===1)hasPageHeading=true;});
  if (hasPageHeading) throw Error(`${filename}: use ## headings; title supplies the page heading`);
  const words = match[2].trim().split(/\s+/).length;
  return {...meta, slug, url:`/blog/${slug}/`, body:match[2], html:markdown.parse(match[2]), minutes:Math.max(1,Math.ceil(words/220))};
}

const dateLabel = date => new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date));
const metaLine = post => `<div class="meta"><span>${escape(post.tag || 'Workshop notes')}</span><span aria-hidden="true">/</span><time datetime="${post.date}">${dateLabel(post.date)}</time><span aria-hidden="true">/</span><span>${post.minutes} min read</span></div>`;
const figure = post => post.image ? `<figure class="cover"><img src="${escape(post.image)}" alt="${escape(post.imageAlt)}" fetchpriority="high">${post.imageCaption ? `<figcaption>${escape(post.imageCaption)}</figcaption>` : ''}</figure>` : '';
const readerReward = post => post.readerCodes ? `<section class="reader-reward" data-reader-reward hidden aria-labelledby="reader-reward-title" data-nosnippet><p class="eyebrow">Thanks for reading</p><h2 id="reader-reward-title">Your next build, $50 less.</h2><p>Five codes, each worth <strong>$50 USD off</strong>. Each code can be redeemed <strong>once in total</strong>, first come, first served.</p><p>Choose 2-step, a Stage 1 or Stage 2 remap, or both on Stripe.</p><ul>${post.readerCodes.map(code=>`<li><code>${escape(code)}</code><a class="reward-use" href="${escape(post.readerCheckout)}?prefilled_promo_code=${encodeURIComponent(code)}" aria-label="Use discount code ${escape(code)}">Use code <span aria-hidden="true">↗</span></a></li>`).join('')}</ul><p class="reward-note">Your selected code is filled in automatically. For remap only, add the remap and then remove 2-step.</p><p class="reward-note">Opening checkout does not reserve a code. If it has already been redeemed, try another. Stripe confirms the discount before you pay.</p></section><script src="/assets/blog-rewards.js" defer></script>` : '';

function layout({title, description, url, image='/og-cmperf.png', type='website', extra='', content}) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} | CM Performance</title><meta name="description" content="${escape(description)}">
<link rel="canonical" href="${origin}${url}"><meta name="theme-color" content="#0a0a0b">
<meta property="og:type" content="${type}"><meta property="og:site_name" content="CM Performance"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${origin}${url}"><meta property="og:image" content="${origin}${escape(image)}">
<meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${escape(title)} | CM Performance">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${origin}${escape(image)}"><meta name="twitter:image:alt" content="${escape(title)} | CM Performance"><link rel="icon" href="/favicon-32.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="CM Performance Blog" href="/blog/feed.xml"><link rel="stylesheet" href="/assets/blog.css">${extra}</head>
<body><a class="skip" href="#main">Skip to content</a><header class="site-header"><div class="wrap header-inner"><a class="brand" href="/" aria-label="CM Performance home"><img src="/favicon-192.png" alt="" width="28" height="28"><span>CM PERFORMANCE</span></a><nav aria-label="Primary"><a href="/">Home</a><a href="/blog/" aria-current="${url === '/blog/' ? 'page' : 'location'}">Blog</a><a href="/#contact">Get in touch <span aria-hidden="true">↗</span></a></nav></div></header>
<main class="wrap" id="main">${content}</main><footer class="site-footer wrap"><span>CM PERFORMANCE</span><nav aria-label="Footer"><a href="/">Home</a><a href="/gallery.html">Gallery</a><a href="/blog/feed.xml">RSS</a><a href="mailto:contact@cmperf.uk">Contact</a></nav></footer></body></html>\n`;
}

export async function buildBlog(root, out, {includeDrafts=false, today=new Date().toISOString().slice(0,10)}={}) {
  const dir = path.join(root,'content/posts');
  const posts = [];
  for (const filename of (await readdir(dir)).filter(name=>name.endsWith('.md'))) {
    const post = parsePost(await readFile(path.join(dir,filename),'utf8'),filename);
    if (post.image) await access(path.join(root,post.image.slice(1)));
    if (!includeDrafts && (post.draft || post.date > today)) continue;
    posts.push(post);
  }
  posts.sort((a,b)=>b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  await mkdir(path.join(out,'blog'),{recursive:true});
  const cards = posts.map(post=>`<article class="post-card">${post.image ? `<a class="card-image" href="${post.url}" tabindex="-1" aria-hidden="true"><img src="${escape(post.image)}" alt="" loading="lazy"></a>` : ''}<div class="card-copy">${metaLine(post)}${post.draft ? '<span class="draft">Draft preview</span>' : ''}<h2><a href="${post.url}">${escape(post.title)}</a></h2><p>${escape(post.description)}</p><a class="read" href="${post.url}">Read the story <span aria-hidden="true">↗</span><span class="sr-only">: ${escape(post.title)}</span></a></div></article>`).join('\n');
  await writeFile(path.join(out,'blog/index.html'),layout({title:'Blog',description:'Development stories, BMW tuning notes and results from the CM Performance workshop.',url:'/blog/',content:`<section class="index-intro"><p class="eyebrow">From the workshop</p><h1>The cars.<br>The work. <em>The details.</em></h1><p>Development stories and tuning notes from CM Performance.</p></section><section class="post-list" aria-label="Latest posts">${cards || '<p>Our first workshop story is on its way.</p>'}</section>`}));
  for (const post of posts) {
    const shareImage=await createPostImage(root,out,post);
    const structured = JSON.stringify({'@context':'https://schema.org','@type':'BlogPosting',headline:post.title,description:post.description,datePublished:post.date,author:{'@type':'Organization',name:'CM Performance'},publisher:{'@type':'Organization',name:'CM Performance'},mainEntityOfPage:origin+post.url,image:origin+shareImage}).replace(/</g,'\\u003c');
    const content = `<article><div class="article-heading"><a class="back" href="/blog/">← All stories</a>${metaLine(post)}${post.draft ? '<span class="draft">Draft preview</span>' : ''}<h1>${escape(post.title)}</h1><p class="standfirst">${escape(post.description)}</p></div>${figure(post)}<div class="prose">${post.html}</div></article><aside class="article-end"><p class="eyebrow">Have a similar BMW project?</p><h2>Tell us about your setup.</h2><p>Send your model, year and current tuning platform. We’ll check the details before confirming what’s possible.</p><a class="button" href="mailto:contact@cmperf.uk?subject=${encodeURIComponent('Enquiry: '+post.title)}">Discuss your build <span aria-hidden="true">↗</span></a></aside>`;
    const dest=path.join(out,'blog',post.slug);await mkdir(dest,{recursive:true});
    await writeFile(path.join(dest,'index.html'),layout({title:post.title,description:post.description,url:post.url,image:shareImage,type:'article',extra:`<meta property="article:published_time" content="${post.date}"><script type="application/ld+json">${structured}</script>${post.draft || post.date>today ? '<meta name="robots" content="noindex">' : ''}`,content:content+readerReward(post)}));
  }
  const publicPosts=posts.filter(post=>!post.draft && post.date<=today);
  const items=publicPosts.map(post=>`<item><title>${escape(post.title)}</title><link>${origin}${post.url}</link><guid>${origin}${post.url}</guid><description>${escape(post.description)}</description><pubDate>${new Date(post.date).toUTCString()}</pubDate></item>`).join('');
  await writeFile(path.join(out,'blog/feed.xml'),`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>CM Performance Blog</title><link>${origin}/blog/</link><description>Development stories and BMW tuning notes.</description><language>en-gb</language>${items}</channel></rss>\n`);
  const sitemap=await readFile(path.join(out,'sitemap.xml'),'utf8');
  await writeFile(path.join(out,'sitemap.xml'),sitemap.replace('</urlset>',`  <url><loc>${origin}/blog/</loc></url>\n${publicPosts.map(post=>`  <url><loc>${origin}${post.url}</loc><lastmod>${post.date}</lastmod></url>`).join('\n')}\n</urlset>`));
  console.log(`Blog: ${posts.length} Markdown post(s) rendered${includeDrafts ? ' (including drafts)' : ''}`);
  return posts;
}
