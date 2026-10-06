const el=id=>document.getElementById(id);
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kind=new URLSearchParams(location.search).get('kind') || 'mental';
const guide=window.MPS_GUIDES[['mental','mental-program'].includes(kind)?kind:'mental'];
let index=0;
el('guide').innerHTML=`<div class="page-heading"><div><span class="eyebrow">MENTAL COACH GUIDE</span><h1>${escapeHTML(guide.title)}</h1><p class="muted">${escapeHTML(guide.description)}</p></div><a class="button" href="${escapeHTML(guide.source)}" target="_blank" rel="noopener">원본 열기 ↗</a></div><div class="guide-toolbar"><button id="prev" class="button">← 이전</button><select id="page" aria-label="설명할 페이지">${guide.pages.map((p,i)=>`<option value="${i}">${i+1}. ${escapeHTML(p.title)}</option>`).join('')}</select><button id="next" class="button">다음 →</button><span id="count"></span></div><div id="guide-page"></div><p class="source-note">${escapeHTML(guide.sourceNote)}</p>`;
function render(){
 const p=guide.pages[index];el('page').value=index;el('prev').disabled=index===0;el('next').disabled=index===guide.pages.length-1;el('count').textContent=`${index+1} / ${guide.pages.length}`;
 const visual=p.image?`<a href="${escapeHTML(p.image)}" target="_blank" rel="noopener"><img src="${escapeHTML(p.image)}" alt="${escapeHTML(p.title)} 실제 샘플 화면"></a>`:`<div class="workflow-visual"><h2>${escapeHTML(p.title)}</h2>${p.steps.map((s,i)=>`<div><span>${i+1}</span>${escapeHTML(s)}</div>`).join('')}</div>`;
 el('guide-page').innerHTML=`<div class="guide-layout"><div class="guide-visual">${visual}</div><aside class="guide-notes"><span class="eyebrow">${escapeHTML(guide.audience)}</span><h2>${escapeHTML(p.title)}</h2><p class="guide-summary">${escapeHTML(p.summary)}</p><h3>이 순서로 읽어주세요</h3><ol>${p.read.map(s=>`<li>${escapeHTML(s)}</li>`).join('')}</ol><h3>쉬운 용어</h3><dl>${p.terms.map(([k,v])=>`<div><dt>${escapeHTML(k)}</dt><dd>${escapeHTML(v)}</dd></div>`).join('')}</dl><div class="say-box"><span>이렇게 설명해 보세요</span><p>“${escapeHTML(p.say)}”</p></div><div class="check-box"><b>코치가 기억할 점</b><p>${escapeHTML(p.check)}</p></div></aside></div>`;
}
el('prev').onclick=()=>{index--;render()};el('next').onclick=()=>{index++;render()};el('page').onchange=e=>{index=Number(e.target.value);render()};render();
