import { Hono } from 'hono'
// @types/linkedom does not exist, linkedom bundles its own types
import { parseHTML } from 'linkedom'
import { Readability } from '@mozilla/readability'

type Bindings = {
  AI: { run: (model: string, opts: { messages: { role: string; content: string }[] }) => Promise<{ response: string }> }
  CACHE: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// ── Frontend (Readwise-style, dark mode, mobile-first) ─────
const HTML = `<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>CleanReader — AI Article Extractor</title>
<meta name=description content="Paste a link. Get a clean, readable article with an AI summary.">
<meta property=og:title content="CleanReader — AI Article Extractor">
<meta property=og:description content="Paste any article link and get a clean, ad-free reading page with AI-generated summary.">
<meta property=og:type content=website>
<meta name=theme-color content=#fafaf9>
<link rel=icon href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📄</text></svg>">
<style>
:root {
  --bg: #fafaf9;
  --card-bg: #fff;
  --text: #1f2937;
  --text-secondary: #6b7280;
  --text-body: #374151;
  --border: #e5e7eb;
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --summary-bg: #f8fafc;
  --summary-border: #2563eb;
  --error-bg: #fef2f2;
  --error-border: #ef4444;
  --error-text: #991b1b;
  --shadow: 0 4px 24px rgba(0,0,0,0.06);
  --radius: 12px;
  --radius-lg: 16px;
  --font: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f0f;
    --card-bg: #1a1a1a;
    --text: #e5e5e5;
    --text-secondary: #a3a3a3;
    --text-body: #d1d5db;
    --border: #333;
    --summary-bg: #111827;
    --summary-border: #3b82f6;
    --error-bg: #1c0000;
    --error-text: #fca5a5;
    --shadow: 0 4px 24px rgba(0,0,0,0.3);
  }
  input[type=url] { background: #1a1a1a; color: var(--text); }
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
.container{max-width:720px;margin:0 auto;padding:40px 20px}
@media (max-width: 640px) {
  .container { padding: 24px 16px; }
}
h1{font-size:2rem;font-weight:700;letter-spacing:-0.02em;margin-bottom:8px}
.subtitle{color:var(--text-secondary);font-size:1rem;margin-bottom:32px}
.input-group{display:flex;gap:12px;margin-bottom:32px}
@media (max-width: 640px) {
  .input-group { flex-direction:column; }
}
input[type=url]{
  flex:1;padding:14px 16px;border:2px solid var(--border);border-radius:var(--radius);
  font-size:16px;font-family:var(--font);outline:none;transition:border-color .2s,box-shadow .2s;
  background:var(--card-bg);color:var(--text);
}
input[type=url]:focus{border-color:var(--accent);box-shadow:0 0 0 3px #bfdbfe}
button{
  padding:14px 28px;background:var(--accent);color:#fff;border:none;border-radius:10px;
  font-size:1rem;font-weight:600;font-family:var(--font);cursor:pointer;
  transition:background .2s,transform .15s,box-shadow .15s,opacity .2s;
  white-space:nowrap;
}
button:hover{background:var(--accent-hover);transform:translateY(-1px);box-shadow:0 4px 12px rgba(37,99,235,0.3)}
button:disabled{opacity:0.6;cursor:not-allowed;transform:none;box-shadow:none}
@media (max-width: 640px) {
  button { width:100%; padding:16px 24px; min-height:48px; }
}
.result{margin-top:0}
.result-card{
  background:var(--card-bg);border-radius:var(--radius-lg);padding:32px;
  box-shadow:var(--shadow);animation:fadeIn .3s ease-out;
}
@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.result-card h2{font-size:1.5rem;font-weight:700;letter-spacing:-0.01em;margin-bottom:8px;line-height:1.3}
@media (max-width: 640px) { .result-card h2 { font-size:1.25rem; } }
.source-link{display:inline-block;margin-bottom:20px;color:var(--accent);font-size:.9rem;text-decoration:none;word-break:break-all}
.source-link:hover{text-decoration:underline}
.summary{
  background:var(--summary-bg);padding:16px 20px;border-radius:var(--radius);
  border-left:4px solid var(--summary-border);margin-bottom:24px;font-size:.95rem;line-height:1.7;
}
.summary-label{font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:6px}
.content{font-size:1.125rem;line-height:1.8;color:var(--text-body)}
@media (max-width: 640px) { .content { font-size:1rem; } }
.content p{margin-bottom:1em}
.content img{max-width:100%;height:auto;border-radius:var(--radius);display:block;margin:0 auto}
.content blockquote{border-left:3px solid #9ca3af;font-style:italic;padding:8px 16px;margin:1em 0;background:var(--summary-bg);border-radius:0 8px 8px 0}
.content a{color:var(--accent);text-decoration:none}
.content a:hover{text-decoration:underline}
.actions{margin-top:24px;display:flex;gap:12px}
@media (max-width: 640px) { .actions { flex-direction:column; } }
.actions button{font-size:.9rem;padding:10px 24px}
@media (max-width: 640px) { .actions button { width:100%; } }
.loading{text-align:center;padding:48px 20px;color:var(--text-secondary)}
.spinner{width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 12px}
@keyframes spin{to{transform:rotate(360deg)}}
.error-card{
  background:var(--error-bg);border-left:4px solid var(--error-border);border-radius:var(--radius);
  padding:16px 20px;color:var(--error-text);font-size:.95rem;
}
footer{margin-top:40px;text-align:center;color:var(--text-secondary);font-size:.8rem}
</style>
</head>
<body>
<div class=container>
<h1>CleanReader</h1>
<p class=subtitle>Paste a link. Get a clean, readable article with an AI summary.</p>
<div class=input-group>
<input type=url id=url placeholder="https://example.com/article" autofocus>
<button id=go onclick=extract()>Extract &amp; Summarize</button>
</div>
<div id=result></div>
<footer>CleanReader — AI Article Extractor</footer>
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
  out.innerHTML='<div class=loading><div class=spinner></div><div>Fetching article...</div></div>';
  btn.disabled=true;
  try{
    const r=await fetch('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const d=await r.json();
    if(!r.ok){out.innerHTML='<div class=error-card>'+ (d.error||'Failed to fetch article. Please check your link.') +'</div>';return}
    out.innerHTML=
      '<div class=result-card>'+
        '<h2>'+(d.title||'Untitled')+'</h2>'+
        '<a class=source-link href='+url+' target=_blank rel=noopener>'+(new URL(url).hostname)+'</a>'+
        '<div class=summary-label>AI Summary</div>'+
        '<div class=summary>'+(d.summary||'Summary unavailable')+'</div>'+
        '<div class=content>'+sanitize(d.content||'')+'</div>'+
        '<div class=actions>'+
          '<button onclick="downloadMd('+JSON.stringify(d.title)+','+JSON.stringify(d.textContent)+')">Download Markdown</button>'+
        '</div>'+
      '</div>';
  }catch(e){
    out.innerHTML='<div class=error-card>Network error. Please try again.</div>';
  }finally{btn.disabled=false}
}

function downloadMd(title,text){
  const blob=new Blob(['# '+title+'\\n\\n'+text],{type:'text/markdown'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(title||'article').replace(/[<>:"/\\\\|?*]/g,'_').slice(0,50)+'.md';
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
    return c.json({ error: 'Please enter a valid URL' }, 400)
  }

  const cacheKey = normalizeUrl(url)

  // Check KV cache
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
    if (!res.ok) return c.json({ error: `Failed to fetch article (HTTP ${res.status})` }, 400)
    html = await res.text()
  } catch {
    return c.json({ error: 'Failed to fetch article. Please check your link.' }, 400)
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
    return c.json({ error: 'Could not extract content from this page.' }, 400)
  }

  // AI summary via Workers AI binding
  let summary = 'Summary unavailable'
  try {
    const promptText = textContent.slice(0, 8000)
    const ai = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'Summarize this article in 3 concise sentences. Match the language of the original text.' },
        { role: 'user', content: promptText },
      ],
    })
    summary = ai.response || summary
  } catch { /* AI failed, summary stays as fallback */ }

  const result = { title, content, textContent, summary, url }

  // Cache 24h
  try { await c.env.CACHE?.put(cacheKey, JSON.stringify(result), { expirationTtl: 86400 }) } catch {}

  return c.json(result)
})

export default app
