import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,access,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parsePost,buildBlog} from '../tools/blog.mjs';

const post=(extra='',body='## Example\n\nA useful story.')=>`---\ntitle: "A BMW story"\ndate: "2026-10-26"\ndescription: "Response & sound"\n${extra}---\n${body}`;
const rewardMeta='readerCodes: [READER1, READER2, READER3, READER4, READER5]\nreaderCheckout: "https://buy.stripe.com/example"\n';

test('Markdown supports readable content and escapes raw HTML and unsafe links',()=>{
  const p=parsePost(post('', '## Result\n\n**Sport+** stays.\n\n<script>alert(1)</script>\n\n[bad](javascript:alert%281%29) [good](/blog/)\n\n| Mode | Result |\n| --- | --- |\n| DSC off | Sport+ |'),'sport-plus.md');
  assert.match(p.html,/<strong>Sport\+<\/strong>/);
  assert.match(p.html,/<table>/);
  assert.match(p.html,/&lt;script&gt;/);
  assert.doesNotMatch(p.html,/<script|href="javascript:/);
  assert.match(p.html,/href="\/blog\/"/);
});

test('invalid metadata cannot silently publish',()=>{
  assert.throws(()=>parsePost(post().replace('2026-10-26','2026-02-30'),'valid.md'),/date/);
  assert.throws(()=>parsePost(post('draft: "false"\n'),'valid.md'),/draft/);
  assert.throws(()=>parsePost(post(),'../escape.md'),/filename/);
  assert.throws(()=>parsePost(post('image: "/assets/../private.png"\nimageAlt: "x"\n'),'valid.md'),/image/);
  assert.throws(()=>parsePost(post('', '# Duplicate heading'),'valid.md'),/headings/);
  assert.throws(()=>parsePost(post(rewardMeta.replace('READER5','READER1')),'valid.md'),/readerCodes/);
  assert.throws(()=>parsePost(post(rewardMeta.replace('buy.stripe.com','example.com')),'valid.md'),/readerCheckout/);
  assert.throws(()=>parsePost(post(rewardMeta.replace('READER1','READER-1')),'valid.md'),/readerCodes/);
});

test('code blocks are highlighted safely and comments are not page headings',()=>{
  const body='```python\n# Intended behaviour\nif mode == "Sport+":\n    profile = "<script>"\n```\n\n```unknown-language\n<img src=x onerror=alert(1)>\n```';
  const p=parsePost(post('',body),'code-example.md');
  assert.match(p.html,/class="hljs-keyword">if/);
  assert.match(p.html,/class="hljs-string"/);
  assert.match(p.html,/class="hljs-comment"/);
  assert.match(p.html,/&lt;script&gt;/);
  assert.match(p.html,/&lt;img/);
  assert.doesNotMatch(p.html,/<script>|<img /);
});

test('static build omits drafts/future posts, generates shareable pages and safe feed',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'cmperf-blog-'));
  try{
    await mkdir(path.join(root,'content/posts'),{recursive:true});
    await mkdir(path.join(root,'dist'));
    await writeFile(path.join(root,'dist/sitemap.xml'),'<urlset></urlset>');
    await writeFile(path.join(root,'content/posts/published.md'),post(rewardMeta));
    await writeFile(path.join(root,'content/posts/draft.md'),post('draft: true\n'));
    await writeFile(path.join(root,'content/posts/future.md'),post().replace('2026-10-26','2027-01-01'));
    const out=path.join(root,'dist');
    const posts=await buildBlog(root,out,{today:'2026-10-26'});
    assert.deepEqual(posts.map(x=>x.slug),['published']);
    await assert.rejects(access(path.join(out,'blog/draft/index.html')));
    await assert.rejects(access(path.join(out,'blog/future/index.html')));
    const article=await readFile(path.join(out,'blog/published/index.html'),'utf8');
    assert.match(article,/rel="canonical" href="https:\/\/cmperf.uk\/blog\/published\/"/);
    assert.match(article,/application\/ld\+json/);
    assert.match(article,/data-reader-reward hidden/);
    for(let i=1;i<=5;i++) assert.ok(article.includes(`href="https://buy.stripe.com/example?prefilled_promo_code=READER${i}"`));
    assert.match(article,/<script src="\/assets\/blog-rewards.js" defer>/);
    const imageURL=/property="og:image" content="https:\/\/cmperf.uk([^\"]+)"/.exec(article)[1];
    const png=await readFile(path.join(out,imageURL.slice(1)));
    assert.equal(png.subarray(1,4).toString(),'PNG');
    assert.equal(png.readUInt32BE(16),1200);
    assert.equal(png.readUInt32BE(20),630);
    assert.ok(article.includes(`name="twitter:image" content="https://cmperf.uk${imageURL}"`));
    const feed=await readFile(path.join(out,'blog/feed.xml'),'utf8');
    assert.match(feed,/Response &amp; sound/);
    assert.doesNotMatch(feed,/\/draft\/|\/future\//);
    assert.doesNotMatch(feed,/READER[1-5]/);
    await writeFile(path.join(out,'sitemap.xml'),'<urlset></urlset>');
    await buildBlog(root,out,{includeDrafts:true,today:'2026-10-26'});
    assert.match(await readFile(path.join(out,'blog/draft/index.html'),'utf8'),/name="robots" content="noindex"/);
    assert.doesNotMatch(await readFile(path.join(out,'sitemap.xml'),'utf8'),/\/draft\/|\/future\//);
  }finally{await rm(root,{recursive:true,force:true});}
});
