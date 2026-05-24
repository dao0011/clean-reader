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
// Kimi optimization items applied: 1(value prop+footer), 2(reading mode), 3(staged loading),
//   4(summary card), 5(empty state), 7(download), 8(error states). Skipped #6(theme only).
const HTML = `<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<meta http-equiv=Cache-Control content="no-cache, no-store, must-revalidate">
<meta http-equiv=Pragma content=no-cache>
<meta http-equiv=Expires content=0>
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
  --fs-content: 1.125rem;
  --progress: 0%;
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
body{font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased;position:relative}
/* ── Progress bar (#2) ── */
.progress-bar{position:fixed;top:0;left:0;height:3px;width:var(--progress);background:linear-gradient(90deg,#2563eb,#60a5fa);z-index:100;transition:width .15s ease-out;pointer-events:none}
.container{max-width:720px;margin:0 auto;padding:40px 20px}
@media (max-width: 640px) {
  .container { padding: 24px 16px; }
}
h1{font-size:2rem;font-weight:700;letter-spacing:-0.02em;margin-bottom:8px}
.subtitle{color:var(--text-secondary);font-size:1rem;margin-bottom:8px}
/* ── Micro features tags (#1) ── */
.feature-tags{display:flex;gap:8px;margin-bottom:28px;flex-wrap:wrap}
.feature-tag{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:999px;font-size:.8rem;font-weight:500;background:var(--summary-bg);border:1px solid var(--border);color:var(--text-secondary);letter-spacing:-0.01em}
/* ── Try with an example (#5) ── */
.example-link{display:inline-block;padding:8px 18px;margin-bottom:28px;font-size:.85rem;font-weight:600;font-family:var(--font);border-radius:10px;color:var(--accent);background:transparent;border:2px solid var(--accent);cursor:pointer;text-decoration:none;transition:background .2s,color .2s}
.example-link:hover{background:var(--accent);color:#fff;text-decoration:none}
.input-group{display:flex;gap:16px;margin-bottom:8px}
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
/* ── Summary card with gradient glow (#4) ── */
.summary{
  background:var(--summary-bg);padding:16px 20px;border-radius:var(--radius);
  border-left:4px solid var(--summary-border);margin-bottom:24px;font-size:.95rem;line-height:1.7;
  position:relative;
}
.summary::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,#2563eb,#60a5fa,transparent);
  border-radius:var(--radius) var(--radius) 0 0;
}
.summary-label{font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:6px}
.summary-points{list-style:none;padding:0}
.summary-points li{position:relative;padding-left:20px;margin-bottom:6px}
.summary-points li::before{content:'\\2726';position:absolute;left:0;color:var(--accent);font-size:.8rem}
/* ── Article metadata (#4) ── */
.article-meta{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;font-size:.8rem;color:var(--text-secondary)}
.article-meta span{display:inline-flex;align-items:center;gap:4px}
/* ── Font size controls (#2) ── */
.font-controls{display:flex;gap:6px;margin-bottom:16px;align-items:center}
.font-controls label{font-size:.8rem;color:var(--text-secondary);margin-right:4px}
.font-btn{width:32px;height:32px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text);font-size:1rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s}
.font-btn:hover{background:var(--summary-bg)}
/* ── Reading mode toggle (#2) ── */
.read-mode-bar{display:flex;gap:8px;margin-bottom:16px;align-items:center}
.read-mode-btn{padding:4px 14px;font-size:.8rem;border:1px solid var(--border);border-radius:6px;background:transparent;color:var(--text-secondary);cursor:pointer;transition:all .15s;font-family:var(--font)}
.read-mode-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.read-mode-btn:hover:not(.active){background:var(--summary-bg)}
/* ── Content area ── */
.content{font-size:var(--fs-content);line-height:1.8;color:var(--text-body);max-width:65ch}
@media (max-width: 640px) { .content { font-size:max(1rem,calc(var(--fs-content)*0.9)); } }
.content.read-mode-only .summary,.content.read-mode-only .font-controls,.content.read-mode-only .read-mode-bar,.content.read-mode-only .article-meta,.content.read-mode-only .actions{display:none}
.content p{margin-bottom:1em}
.content img{max-width:100%;height:auto;border-radius:var(--radius);display:block;margin:0 auto}
.content blockquote{border-left:3px solid #9ca3af;font-style:italic;padding:8px 16px;margin:1em 0;background:var(--summary-bg);border-radius:0 8px 8px 0}
.content a{color:var(--accent);text-decoration:none}
.content a:hover{text-decoration:underline}
.actions{margin-top:24px;display:flex;gap:12px;flex-wrap:wrap}
@media (max-width: 640px) { .actions { flex-direction:column; } }
.actions button,.actions .dropdown-toggle{font-size:.9rem;padding:10px 24px}
@media (max-width: 640px) { .actions button,.actions .dropdown-toggle { width:100%; } }
/* ── Download dropdown (#7) ── */
.dropdown{position:relative;display:inline-block}
@media (max-width: 640px) { .dropdown { width:100%; } }
.dropdown-toggle{background:var(--accent);color:#fff;border:none;border-radius:10px;font-size:.9rem;font-weight:600;font-family:var(--font);cursor:pointer;padding:10px 24px;transition:background .2s,transform .15s;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;width:auto}
.dropdown-toggle:hover{background:var(--accent-hover);transform:translateY(-1px);box-shadow:0 4px 12px rgba(37,99,235,0.3)}
@media (max-width: 640px) { .dropdown-toggle { width:100%; justify-content:center; } }
.dropdown-menu{position:absolute;top:calc(100% + 4px);left:0;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);z-index:50;min-width:220px;display:none;overflow:hidden}
.dropdown-menu.open{display:block}
.dropdown-item{padding:10px 16px;cursor:pointer;font-size:.85rem;color:var(--text);border:none;background:none;width:100%;text-align:left;font-family:var(--font);transition:background .1s;display:flex;align-items:center;gap:8px}
.dropdown-item:hover{background:var(--summary-bg)}
.dropdown-item .ext-info{font-size:.75rem;color:var(--text-secondary);margin-left:auto}
/* ── Loading states (#3) ── */
.loading{text-align:center;padding:48px 20px;color:var(--text-secondary)}
.loading-stage{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;font-size:.95rem}
.loading-stage .stage-icon{width:20px;height:20px;flex-shrink:0}
.loading-stage.current{color:var(--text);font-weight:500}
.loading-stage.done{color:var(--accent)}
.loading-stage.pending{opacity:0.4}
.spinner{width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 12px}
@keyframes spin{to{transform:rotate(360deg)}}
.loading-humor{margin-top:16px;font-size:.85rem;font-style:italic;opacity:0.7;min-height:1.4em}
/* ── Error card (#8) ── */
.error-card{
  background:var(--error-bg);border-left:4px solid var(--error-border);border-radius:var(--radius);
  padding:16px 20px;color:var(--error-text);font-size:.95rem;
}
.error-card .error-emoji{font-size:1.5rem;margin-bottom:4px}
.error-card .error-title{font-weight:600;margin-bottom:4px}
.error-card .error-hint{font-size:.85rem;opacity:0.85}
.error-fallback{margin-top:12px}
.error-fallback textarea{width:100%;padding:12px;border:2px solid var(--error-border);border-radius:var(--radius);font-size:.9rem;font-family:var(--font);background:var(--card-bg);color:var(--text);resize:vertical;min-height:80px;margin-bottom:8px}
.error-fallback textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px #bfdbfe}
/* ── Footer (#1) ── */
footer.main-footer{margin-top:48px;border-top:1px solid var(--border);padding-top:24px;text-align:center}
footer.main-footer .footer-links{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;font-size:.8rem;color:var(--text-secondary);margin-bottom:8px}
footer.main-footer .footer-links a{color:var(--text-secondary);text-decoration:none}
footer.main-footer .footer-links a:hover{color:var(--accent);text-decoration:underline}
footer.main-footer .footer-copy{font-size:.75rem;color:var(--text-secondary);opacity:0.6}
/* ── Paste text area fallback (#8) ── */
.paste-text-area{display:none;margin-bottom:16px}
.paste-text-area.visible{display:block}
.paste-text-area label{display:block;font-size:.85rem;color:var(--text-secondary);margin-bottom:6px}
.paste-text-area textarea{width:100%;padding:12px;border:2px solid var(--border);border-radius:var(--radius);font-size:.9rem;font-family:var(--font);background:var(--card-bg);color:var(--text);resize:vertical;min-height:100px}
.paste-text-area textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px #bfdbfe}
</style>
</head>
<body>
<div class=progress-bar id=progressBar></div>
<div class=container>
<h1>CleanReader</h1>
<p class=subtitle>Extract clutter-free articles and generate AI summaries instantly</p>

<!-- Micro features tags (#1) -->
<div class=feature-tags>
  <span class=feature-tag>&#x1f680; Fast</span>
  <span class=feature-tag>&#x26a1; AI-Powered</span>
  <span class=feature-tag>&#x1f512; Privacy-First</span>
</div>

<!-- Try with an example (#5) -->
<a class=example-link id=exampleLink href="/api/extract-page?url=https://en.wikipedia.org/wiki/Web_scraping" onclick=document.body.innerHTML=LOADING_HTML>&#x1f4ac; Try with an example</a>

<form action=/api/extract-page method=GET onsubmit="var u=document.getElementById('url');if(!u.value.trim())return false;document.body.innerHTML=LOADING_HTML">
<div class=input-group>
<input type=url id=url name=url placeholder="https://example.com/article" autofocus>
<button type=submit id=go>Extract &amp; Summarize</button>
</div>
</form>

<!-- Paste text fallback (#8) -->
<div class=paste-text-area id=pasteArea>
  <label for=pasteText>Paste article text directly:</label>
  <textarea id=pasteText placeholder="Paste the full article text here..."></textarea>
  <button onclick=extractPasted() style="width:auto">Summarize Pasted Text</button>
</div>

<div id=result></div>

<!-- Footer (#1) -->
<footer class=main-footer>
  <div class=footer-links>
    <span>&#x1f680; Fast</span>
    <span>&#x26a1; AI-Powered</span>
    <span>&#x1f512; Privacy-First</span>
  </div>
  <div class=footer-copy>&copy; 2026 CleanReader &middot; Open Source &middot; Built on Cloudflare</div>
</footer>
</div>

<script>
const out=document.getElementById('result');
const btn=document.getElementById('go');
const inp=document.getElementById('url');
const progressBar=document.getElementById('progressBar');
const pasteArea=document.getElementById('pasteArea');
const pasteText=document.getElementById('pasteText');

// ── Loading screen for no-JS fallback ──
const LOADING_HTML='<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#fafaf9"><div style="width:44px;height:44px;border:3px solid #e5e7eb;border-top-color:#2563eb;border-radius:50%;animation:spin .7s linear infinite;margin-bottom:20px"></div><p style="color:#374151;font-size:1rem;font-weight:500;margin:0">Extracting article...</p><p style="color:#9ca3af;font-size:.85rem;margin:8px 0 0">This usually takes 2 seconds</p></div><style>@keyframes spin{to{transform:rotate(360deg)}}@media (prefers-color-scheme:dark){body{background:#0f0f0f!important}p{color:#e5e5e5!important}}</style>';

// ── Enter key shortcut ──
inp.addEventListener('keydown',e=>{if(e.key==='Enter')extract()});

// ── Reading progress bar (#2) ──
let progressObserving=false;
function startProgressObserver(){
  if(progressObserving)return;
  progressObserving=true;
  const resultCard=out.querySelector('.result-card');
  if(!resultCard)return;
  const update=()=>{
    const rect=resultCard.getBoundingClientRect();
    const total=rect.height-window.innerHeight+rect.top;
    if(total<=0){progressBar.style.setProperty('--progress','100%');return}
    const scrolled=-rect.top;
    const pct=Math.min(100,Math.max(0,(scrolled/total)*100));
    progressBar.style.setProperty('--progress',pct+'%');
  };
  window.addEventListener('scroll',update,{passive:true});
  update();
}

// ── Font size controls (#2) ──
function changeFontSize(delta){
  const fs=parseFloat(localStorage.getItem('cr_font_size')||'1.125');
  let newFs=fs+delta;
  if(newFs<0.75)newFs=0.75;
  if(newFs>1.75)newFs=1.75;
  localStorage.setItem('cr_font_size',String(newFs));
  document.documentElement.style.setProperty('--fs-content',newFs+'rem');
}

// ── Load saved font size ──
const savedFs=localStorage.getItem('cr_font_size');
if(savedFs)document.documentElement.style.setProperty('--fs-content',savedFs+'rem');

// ── Reading mode toggle (#2) ──
let readingMode=false;
function toggleReadingMode(el){
  readingMode=!readingMode;
  el.textContent=readingMode?'📖 Exit Reading Mode':'🔍 Reading Mode';
  el.classList.toggle('active',readingMode);
  document.querySelectorAll('.content')[0]?.classList.toggle('read-mode-only',readingMode);
}

// ── HTML sanitizer ──
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

// ── Staged loading (#3) ──
const STAGES=[
  {label:'Fetching article...',icon:'🌐'},
  {label:'Extracting content...',icon:'📄'},
  {label:'Summarizing with AI...',icon:'✨'},
];

function showStagedLoading(){
  const humorMsgs=[
    'This article is wordy. AI is working hard.',
    'Counting paragraphs... almost there.',
    'Reading between the lines for you.',
    'Brewing a fresh summary just for you.',
    'Decoding the article so you do not have to.',
  ];
  const stagesHtml=STAGES.map((s,i)=>'<div class="loading-stage current" data-stage='+i+'>'+
    '<span class=stage-icon>'+s.icon+'</span><span>'+s.label+'</span></div>').join('');
  out.innerHTML='<div class=loading>'+stagesHtml+
    '<div class=spinner></div>'+
    '<div class=loading-humor id=loadingHumor></div></div>';
  // advance stages
  const stageEls=out.querySelectorAll('.loading-stage');
  let humorTimer=null;
  stageEls.forEach((el,i)=>{
    setTimeout(()=>{
      // mark prev done
      if(i>0)stageEls[i-1].className='loading-stage done';
      stageEls[i].className='loading-stage current';
      if(i===STAGES.length-1){
        // last stage: show humor after 2s
        humorTimer=setTimeout(()=>{
          const h=document.getElementById('loadingHumor');
          if(h)h.textContent=humorMsgs[Math.floor(Math.random()*humorMsgs.length)];
        },2000);
      }
    },i*1800);
  });
  // cleanup timer
  out._humorCleanup=()=>{if(humorTimer)clearTimeout(humorTimer)};
}

// ── Word count & reading time (#4) ──
function estimateReadingTime(text){
  const wc=(text||'').trim().split(/\\s+/).length;
  const rt=Math.max(1,Math.round(wc/200));
  return {words:wc,minutes:rt};
}

// ── Download state (#7) ──
let currentDownloadData=null;

function doDownloadMarkdown(){
  if(!currentDownloadData)return;
  const {title,text,summary,source}=currentDownloadData;
  const now=new Date().toISOString().slice(0,10);
  const frontmatter='---\\ntitle: "'+(title||'Untitled')+'"\\nsource: "'+source+'"\\nextracted_at: "'+now+'"\\nsummary: "'+summary+'"\\n---\\n\\n';
  const body='# '+title+'\\n\\n'+text;
  downloadFile(frontmatter+body,'.md','text/markdown');
}

function doDownloadPlain(){
  if(!currentDownloadData)return;
  const {title,text}=currentDownloadData;
  downloadFile(title+'\\n\\n'+text,'.txt','text/plain');
}

function doDownloadHTML(){
  if(!currentDownloadData)return;
  const {title,content}=currentDownloadData;
  const html='<!doctype html><html><head><meta charset=utf-8><title>'+title+'</title><style>body{max-width:720px;margin:40px auto;padding:0 20px;font-family:sans-serif;line-height:1.8;color:#333}img{max-width:100%}blockquote{border-left:3px solid #ccc;padding-left:16px;margin:1em 0;color:#666}</style></head><body><h1>'+title+'</h1>'+sanitize(content)+'</body></html>';
  downloadFile(html,'.html','text/html');
}

function downloadFile(content,ext,mime){
  const blob=new Blob([content],{type:mime});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  const name=currentDownloadData?.title||'article';
  a.download=name.replace(/[<>:\\"/\\|?*]/g,'_').slice(0,50)+ext;
  a.click();
}

// ── Error handling (#8) ──
function categorizeError(msg){
  if(msg.includes('403')||msg.includes('block'))return {emoji:'🔒',title:'Access Denied',hint:'This site blocks bots. Try a public article or paste text directly.'};
  if(msg.includes('404')||msg.includes('not found'))return {emoji:'🔍',title:'Page Not Found',hint:'The URL does not point to a valid article. Check the link and try again.'};
  if(msg.includes('timeout')||msg.includes('slow')||msg.includes('time'))return {emoji:'⏱️',title:'Request Timed Out',hint:'The site is slow. Try again or check the URL.'};
  if(msg.includes('extract')||msg.includes('content'))return {emoji:'📄',title:'Extraction Failed',hint:'We could not extract the article body. The page might be a video, image gallery, or PDF.'};
  return {emoji:'⚠️',title:'Something Went Wrong',hint:msg||'An unexpected error occurred. Please try again.'};
}

function showError(msg){
  const cat=categorizeError(msg);
  out.innerHTML='<div class=error-card>'+
    '<div class=error-emoji>'+cat.emoji+'</div>'+
    '<div class=error-title>'+cat.title+'</div>'+
    '<div class=error-hint>'+cat.hint+'</div>'+
    '<div class=error-fallback>'+
      '<button onclick="showPasteTextArea()" style="font-size:.85rem;padding:8px 16px;margin-top:8px">📝 Paste text manually</button>'+
    '</div>'+
  '</div>';
}

function showPasteTextArea(){
  pasteArea.classList.toggle('visible');
}

function extractPasted(){
  const text=pasteText.value.trim();
  if(!text)return;
  inp.value='';
  btn.disabled=true;
  showStagedLoading();
  const loadStart=Date.now();
  setTimeout(async()=>{
    try{
      const r=await fetch('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:true,content:text})});
      const d=await r.json();
      if(out._humorCleanup)out._humorCleanup();
      if(!r.ok){showError(d.error||'Failed to process text.');return}
      renderResult(d,'');
    }catch(e){
      showError('Network error. Please try again.');
    }finally{btn.disabled=false}
  },Math.max(0,4000-(Date.now()-loadStart)));
}

// ── Render result card ──
function renderResult(d,url){
  const meta=estimateReadingTime(d.textContent||'');
  const hostname=url?(()=>{try{return new URL(url).hostname}catch{return ''}})():'';
  // Build summary points
  const summaryText=d.summary||'Summary unavailable';
  const points=summaryText.split(/\\.\\s+/).filter(Boolean);
  const summaryHtml=points.length>1
    ? '<ul class=summary-points>'+points.map(p=>'<li>'+(p.endsWith('.')?p:p+'.')+'</li>').join('')+'</ul>'
    : '<div>'+summaryText+'</div>';

  currentDownloadData={title:d.title,text:d.textContent||'',content:d.content||'',summary:d.summary||'',source:url||''};

  out.innerHTML=
    '<div class=result-card>'+
      '<h2>'+(d.title||'Untitled')+'</h2>'+
      (hostname?'<a class=source-link href='+url+' target=_blank rel=noopener>'+hostname+'</a>':'')+
      // Metadata (#4)
      '<div class=article-meta>'+
        '<span>🕒 '+meta.minutes+' min read</span>'+
        '<span>📋 '+meta.words.toLocaleString()+' words</span>'+
        (hostname?'<span>🌐 '+hostname+'</span>':'')+
      '</div>'+
      // Font controls (#2)
      '<div class=font-controls>'+
        '<label>Font:</label>'+
        '<button class=font-btn onclick="changeFontSize(-0.125)" title="Decrease font size">A−</button>'+
        '<button class=font-btn onclick="changeFontSize(0.125)" title="Increase font size">A+</button>'+
      '</div>'+
      // Reading mode button (#2)
      '<div class=read-mode-bar>'+
        '<button class="read-mode-btn" onclick="toggleReadingMode(this)" style="width:auto">🔍 Reading Mode</button>'+
      '</div>'+
      // Summary card with gradient glow (#4)
      '<div class=summary-label>AI Summary</div>'+
      '<div class=summary>'+summaryHtml+'</div>'+
      // Content
      '<div class=content>'+sanitize(d.content||'')+'</div>'+
      // Actions (#7)
      '<div class=actions>'+
        '<div class=dropdown>'+
          '<button class=dropdown-toggle onclick="event.stopPropagation();this.nextElementSibling.classList.toggle(\'open\')">📥 Download <span style=font-size:.75rem>▼</span></button>'+
          '<div class=dropdown-menu>'+
            '<button class=dropdown-item data-format=md><span>📝</span> Markdown <span class=ext-info>~'+Math.round((d.textContent||'').length/1024)+' KB</span></button>'+
            '<button class=dropdown-item data-format=txt><span>📄</span> Plain Text</button>'+
            '<button class=dropdown-item data-format=html><span>🌐</span> HTML</button>'+
          '</div>'+
        '</div>'+
      '</div>'+
    '</div>';
  // Init dropdown listeners
  const toggle=out.querySelector('.dropdown-toggle');
  const menu=out.querySelector('.dropdown-menu');
  if(toggle&&menu){
    toggle.addEventListener('click',e=>{
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.addEventListener('click',()=>menu.classList.remove('open'));
    menu.querySelectorAll('.dropdown-item').forEach(item=>{
      item.addEventListener('click',()=>{
        menu.classList.remove('open');
        const fmt=item.dataset.format;
        if(fmt==='md')doDownloadMarkdown();
        else if(fmt==='txt')doDownloadPlain();
        else if(fmt==='html')doDownloadHTML();
      });
    });
  }
  // Reading progress bar
  startProgressObserver();
}

// ── Main extract function ──
async function extract(retryUrls){
  const url=inp.value.trim();
  if(!url)return;
  if(btn)btn.disabled=true;
  progressBar.style.setProperty('--progress','0%');
  showStagedLoading();
  const loadStart=Date.now();
  try{
    const r=await fetch('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    const d=await r.json();
    if(out._humorCleanup)out._humorCleanup();
    if(!r.ok){
      if(retryUrls&&retryUrls.length){
        inp.value=retryUrls[0];
        await extract(retryUrls.slice(1));
        return;
      }
      showError(d.error||'Failed to fetch article.');return
    }
    renderResult(d,url);
  }catch(e){
    if(out._humorCleanup)out._humorCleanup();
    if(retryUrls&&retryUrls.length){
      inp.value=retryUrls[0];
      await extract(retryUrls.slice(1));
      return;
    }
    showError('Network error. Please try again.');
  }finally{if(btn)btn.disabled=false}
}

// Init download handler for extra safety
document.addEventListener('DOMContentLoaded',()=>{
  // Global click handler for dropdown items
  document.addEventListener('click',e=>{
    const item=e.target.closest('.dropdown-item');
    if(!item)return;
    const fmt=item.dataset.format;
    if(fmt==='md')doDownloadMarkdown();
    else if(fmt==='txt')doDownloadPlain();
    else if(fmt==='html')doDownloadHTML();
  });
});
</script>
</body>
</html>`

app.get('/', (c) => c.html(HTML, 200, { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' }))

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

// ── Server-rendered extract page (no JS needed) ──
app.get('/api/extract-page', async (c) => {
  const urlParam = c.req.query('url')
  const url = urlParam && /^https?:\/\/.+/i.test(urlParam) ? urlParam : 'https://en.wikipedia.org/wiki/Web_scraping'
  const cacheKey = normalizeUrl(url)
  let result: any = null

  // Check KV cache
  try {
    const cached = await c.env.CACHE?.get(cacheKey)
    if (cached) result = JSON.parse(cached)
  } catch {}

  if (!result) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      })
      const html = await res.text()
      const { document } = parseHTML(html)
      const article = new Readability(document).parse()
      if (!article || (!article.title && !article.textContent)) {
        return c.html('<html><body><h1>Failed to extract article</h1><p>Could not extract content. <a href="/">Go back</a></p></body></html>')
      }
      let summary = 'Summary unavailable'
      try {
        const promptText = (article.textContent || '').slice(0, 8000)
        const ai = await c.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            { role: 'system', content: 'Summarize this article in 3 concise sentences. Match the language of the original text.' },
            { role: 'user', content: promptText },
          ],
        })
        summary = ai.response || summary
      } catch {}
      result = { title: article.title, content: article.content, textContent: article.textContent, summary, url }
      try { await c.env.CACHE?.put(cacheKey, JSON.stringify(result), { expirationTtl: 86400 }) } catch {}
    } catch {
      return c.html('<html><body><h1>Error</h1><p>Failed to fetch article. <a href="/">Go back</a></p></body></html>')
    }
  }

  const { title, content, textContent, summary } = result
  const wordCount = (textContent || '').trim().split(/\s+/).length
  const readTime = Math.max(1, Math.round(wordCount / 200))

  const points = (summary || '').split(/\.\s+/).filter(Boolean)
  const summaryHtml = points.length > 1
    ? '<ul>' + points.map((p: string) => '<li>' + (p.endsWith('.') ? p : p + '.') + '</li>').join('') + '</ul>'
    : '<p>' + summary + '</p>'

  return c.html(`<!doctype html>
<html lang=en>
<head>
<meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>${escapeHtml(title || 'Untitled')} — CleanReader</title>
<meta name=robots content=noindex>
<style>
:root{--bg:#fafaf9;--card-bg:#fff;--text:#1f2937;--text-secondary:#6b7280;--text-body:#374151;--border:#e5e7eb;--accent:#2563eb;--radius:12px;--radius-lg:16px;--font:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#0f0f0f;--card-bg:#1a1a1a;--text:#e5e5e5;--text-secondary:#a3a3a3;--text-body:#d1d5db;--border:#333;--summary-bg:#111827}}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font);background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
.container{max-width:720px;margin:0 auto;padding:40px 20px}
.back{margin-bottom:24px}
.back a{color:var(--accent);text-decoration:none;font-size:.9rem}
.back a:hover{text-decoration:underline}
.card{background:var(--card-bg);border-radius:var(--radius-lg);padding:32px;box-shadow:0 4px 24px rgba(0,0,0,0.06)}
@media(max-width:640px){.container{padding:24px 16px}.card{padding:24px 16px}}
h1{font-size:1.5rem;font-weight:700;letter-spacing:-0.01em;margin-bottom:8px;line-height:1.3}
.source{display:inline-block;margin-bottom:20px;color:var(--accent);font-size:.9rem;text-decoration:none;word-break:break-all}
.source:hover{text-decoration:underline}
.meta{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:20px;font-size:.8rem;color:var(--text-secondary)}
.summary-card{background:var(--summary-bg, #f8fafc);padding:16px 20px;border-radius:var(--radius);border-left:4px solid var(--accent);margin-bottom:24px;font-size:.95rem;line-height:1.7}
.summary-label{font-weight:600;font-size:.8rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:6px}
.summary-card ul{list-style:none;padding:0}
.summary-card li{position:relative;padding-left:20px;margin-bottom:6px}
.summary-card li::before{content:'\\2726';position:absolute;left:0;color:var(--accent);font-size:.8rem}
.content{font-size:1.125rem;line-height:1.8;color:var(--text-body);max-width:65ch}
.content p{margin-bottom:1em}
.content img{max-width:100%;height:auto;border-radius:var(--radius);display:block;margin:0 auto}
.content blockquote{border-left:3px solid #9ca3af;font-style:italic;padding:8px 16px;margin:1em 0;background:var(--summary-bg, #f8fafc);border-radius:0 8px 8px 0}
.content a{color:var(--accent);text-decoration:none}
.content a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class=container>
<div class=back><a href=/>← Back to CleanReader</a></div>
<div class=card>
<h1>${escapeHtml(title || 'Untitled')}</h1>
<a class=source href="${escapeHtml(url)}" target=_blank rel=noopener>${escapeHtml(new URL(url).hostname)}</a>
<div class=meta><span>🕒 ${readTime} min read</span><span>📋 ${wordCount.toLocaleString()} words</span><span>🌐 ${escapeHtml(new URL(url).hostname)}</span></div>
<div class=summary-label>AI Summary</div>
<div class=summary-card>${summaryHtml}</div>
<div class=content>${sanitize2(content || '')}</div>
</div>
</div>
</body>
</html>`, 200, { 'Cache-Control': 'no-cache, no-store, must-revalidate' })
})

// ── Helpers for server-rendered page ──
function escapeHtml(str: string): string {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

function sanitize2(html: string): string {
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,'').replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,'')
}

export default app
