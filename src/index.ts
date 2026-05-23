import { Hono } from 'hono'
// @types/linkedom does not exist, linkedom bundles its own types
import { parseHTML } from 'linkedom'
import { Readability } from '@mozilla/readability'

type Bindings = {
  AI: { run: (model: string, opts: { messages: { role: string; content: string }[] }) => Promise<{ response: string }> }
  CACHE: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// ── Frontend ──────────────────────────────────────────────
const HTML = `<!doctype html>
<html lang=zh-CN>
<head>
<meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>CleanReader - AI 网页净化器</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#f5f5f5;color:#1a1a1a;line-height:1.6}
.container{max-width:800px;margin:0 auto;padding:40px 20px}
h1{font-size:1.8rem;margin-bottom:8px}
.subtitle{color:#666;margin-bottom:32px}
.input-group{display:flex;gap:12px;margin-bottom:32px}
input[type=url]{flex:1;padding:12px 16px;border:2px solid #e0e0e0;border-radius:8px;font-size:1rem;outline:none;transition:border-color .2s}
input[type=url]:focus{border-color:#2563eb}
button{padding:12px 24px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:1rem;cursor:pointer;transition:background .2s}
button:hover{background:#1d4ed8}
button:disabled{background:#93c5fd;cursor:not-allowed}
.result{background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.result h2{font-size:1.3rem;margin-bottom:12px}
.summary{background:#f0f7ff;padding:16px;border-radius:8px;margin-bottom:20px;font-size:.95rem;line-height:1.7}
.content{font-size:1rem;line-height:1.8}
.content img{max-width:100%}
.content p{margin-bottom:1em}
.actions{margin-top:20px;display:flex;gap:12px}
.actions button{font-size:.9rem;padding:8px 20px}
.loading{text-align:center;padding:40px;color:#666}
.error{background:#fff0f0;color:#c00;padding:16px;border-radius:8px}
</style>
</head>
<body>
<div class=container>
<h1>CleanReader</h1>
<p class=subtitle>粘贴网页链接，AI 自动提取正文并生成摘要</p>
<div class=input-group>
<input type=url id=url placeholder="https://..." autofocus>
<button id=go onclick=extract()>净化</button>
</div>
<div id=result></div>
</div>
<script>
const out=document.getElementById('result');
const btn=document.getElementById('go');
const inp=document.getElementById('url');

inp.addEventListener('keydown',e=>{if(e.key==='Enter')extract()});

function sanitize(html){
  const div=document.createElement('div');
  div.innerHTML=html;
  for(const tag of div.querySelectorAll('script,iframe,object,embed,link,style'))tag.remove();
  for(const el of div.querySelectorAll('*')){
    for(const attr of[...el.attributes]){
      if(attr.name.startsWith('on')||(attr.name==='href'&&attr.value.startsWith('javascript:')))el.removeAttribute(attr.name);
    }
  }
  return div.innerHTML;
}

async function extract(){
  const url=inp.value.trim();
  if(!url)return;
  out.innerHTML='<div class=loading>抓取中...</div>';
  btn.disabled=true;
  try{
    const r=await fetch('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const d=await r.json();
    if(!r.ok){out.innerHTML=\`<div class=error>\${d.error||'失败'}</div>\`;return}
    out.innerHTML=\`
      <div class=result>
        <h2>\${d.title||'无标题'}</h2>
        <div class=summary>\u{1f4dd} <strong>AI 摘要：</strong>\${d.summary||'摘要生成失败'}</div>
        <div class=content>\${sanitize(d.content||'')}</div>
        <div class=actions>
          <button onclick="downloadMd(\${JSON.stringify(d.title)},\${JSON.stringify(d.textContent)})">下载 Markdown</button>
        </div>
      </div>\`;
  }catch(e){
    out.innerHTML=\`<div class=error>网络错误: \${e.message}</div>\`;
  }finally{btn.disabled=false}
}

function downloadMd(title,text){
  const blob=new Blob(['# '+title+'\\n\\n'+text],{type:'text/markdown'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(title||'article').replace(/[<>:"/\\\\\\\\|?*]/g,'_').slice(0,50)+'.md';
  a.click()
}
</script>
</body>
</html>`

app.get('/', (c) => c.html(HTML))

// ── Helpers ───────────────────────────────────────────────
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.protocol = u.protocol.toLowerCase();
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'spm', 'from'].forEach(param => {
      u.searchParams.delete(param);
    });
    return u.toString();
  } catch {
    return url;
  }
}

// ── Extract API ───────────────────────────────────────────
app.post('/api/extract', async (c) => {
  const { url } = await c.req.json<{ url: string }>()

  if (!url || !/^https?:\/\/.+/i.test(url)) {
    return c.json({ error: '请输入有效的网页链接' }, 400)
  }

  const cacheKey = normalizeUrl(url)

  // Check KV cache (gracefully skip if binding not available)
  let cached: string | null = null
  try { cached = await c.env.CACHE?.get(cacheKey) } catch {}
  if (cached) return c.json(JSON.parse(cached))

  // Fetch target page
  let html: string
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })
    if (!res.ok) return c.json({ error: `无法抓取该网页 (HTTP ${res.status})` }, 400)
    html = await res.text()
  } catch {
    return c.json({ error: '无法抓取该网页，请检查链接是否正确' }, 400)
  }

  // Extract with Readability
  let title = ''
  let content = ''
  let textContent = ''
  try {
    const { document } = parseHTML(html)
    const article = new Readability(document).parse()
    if (article) {
      title = article.title || ''
      content = article.content || ''
      textContent = article.textContent || ''
    }
  } catch { /* extraction failed, use empty defaults */ }

  if (!title && !textContent) {
    return c.json({ error: '未能从该网页提取到正文内容' }, 400)
  }

  // AI summary via Workers AI binding
  let summary = '摘要生成失败'
  try {
    const promptText = textContent.slice(0, 8000)
    const lang = /[一-鿿]/.test(promptText.slice(0, 200)) ? 'zh' : 'en'
    const ai = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: lang === 'zh'
          ? '请用3句话总结以下文章的核心观点，语言与原文一致。只输出摘要，不要其他内容。'
          : 'Summarize the following article in 3 sentences. Output only the summary.' },
        { role: 'user', content: promptText },
      ],
    })
    summary = ai.response || summary
  } catch (e: any) { summary = '摘要生成失败' }

  const result = { title, content, textContent, summary, url }

  // Cache 24h (gracefully skip if binding not available)
  try { await c.env.CACHE?.put(cacheKey, JSON.stringify(result), { expirationTtl: 86400 }) } catch {}

  return c.json(result)
})

export default app
