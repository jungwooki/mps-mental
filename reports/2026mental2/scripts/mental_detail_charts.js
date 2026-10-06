const DETAIL_METRICS=['경기 안정성','경기 중 감정 조절','외부평가 독립성','자기주도 학습능력','이미지트레이닝 활용능력','주위 적응 및 활용 능력','실패 후 회복력','훈련 태도 지수'];
const detailValid=v=>Number.isFinite(v)&&v>=1&&v<=6;
const detailFixed=v=>detailValid(v)?v.toFixed(2):'—';
const detailDiff=(v,ref)=>{if(!detailValid(v)||!detailValid(ref))return '—';const d=Number((v-ref).toFixed(2));return (d>0?'+':'')+d.toFixed(2);};
function detailAgeYears(a){const months=a.growth?.chronologicalMonths;return Number.isFinite(months)&&months>=0?Math.floor(months/12):null;}
function detailStats(records){return Object.fromEntries(DETAIL_METRICS.map(name=>{const values=records.map(a=>a.raw[name]).filter(detailValid);return [name,{n:values.length,mean:values.length?values.reduce((s,v)=>s+v,0)/values.length:null}];}));}
function detailPrevious(current,records){
 if(!current.chart||!current.birth||!current.sex||!current.n)return {record:null,reason:'identity'};
 const older=records.filter(a=>a!==current&&a.chart===current.chart&&a.birth===current.birth&&a.sex===current.sex&&a.n===current.n&&a.date<current.date).sort((a,b)=>b.date.localeCompare(a.date));
 if(!older.length)return {record:null,reason:'none'};
 const sameDate=older.filter(a=>a.date===older[0].date);
 if(sameDate.some(a=>DETAIL_METRICS.some(n=>a.raw[n]!==sameDate[0].raw[n])))return {record:null,reason:'conflict'};
 if((current.assessmentVersion||'mps-mental-v3')!==(older[0].assessmentVersion||'mps-mental-v3'))return {record:null,reason:'version'};
 return {record:older[0],reason:null};
}
function detailChange(value,previous,history){
 if(!detailValid(value))return {kind:'empty',label:'미측정',arrow:''};
 if(!history.record)return {kind:'empty',label:history.reason==='none'?'이전 기록 없음':'비교 보류',arrow:''};
 if(!detailValid(previous))return {kind:'empty',label:'이전 미측정',arrow:''};
 const d=value-previous;
 return Math.abs(d)<1e-8?{kind:'same',label:'유지',arrow:'→'}:d>0?{kind:'up',label:'향상',arrow:'↑'}:{kind:'down',label:'저하',arrow:'↓'};
}
function detailBar(name,value,stat,kind,options){
 const sampled=options.sample&&stat?.example,ref=stat?.mean,n=stat?.n||0,hasMean=detailValid(ref)&&(sampled||n>=2),valid=detailValid(value)&&hasMean;
 const meta=sampled?'예시 평균':`${n+(kind==='stage'&&options.stageKnown&&!options.sample?100:0)}건${n>0&&n<10?' · 소표본':''}`;
 const reason=!detailValid(value)?'미측정':kind==='stage'&&!options.stageKnown?'단계 확인':kind==='peer'&&!options.ageKnown?'나이 확인':'자료 부족';
 const d=valid?value-ref:0,left=50+Math.min(0,d)*10,width=Math.abs(d)*10;
 const label=`${name}, ${kind==='stage'?'같은 성장단계':'같은 만 나이'}: ${valid?`현재 ${value.toFixed(1)}점, 평균 ${ref.toFixed(2)}점, 차이 ${detailDiff(value,ref)}점`:reason}`;
 return `<div class="detail-bar cohort-${kind}" data-value="${detailValid(value)?value:''}" data-mean="${hasMean?ref:''}" data-count="${n}" data-comparable="${valid}"><div class="detail-bar-meta"><b>평균 ${hasMean?ref.toFixed(2):'—'}</b><span>${meta}</span></div><div class="detail-bar-body"><div class="detail-track" role="img" aria-label="${esc(label)}">${valid?`<span class="metric-fill" style="left:${left}%;width:${width}%"></span><span class="mean-marker" aria-hidden="true"></span>`:`<div class="detail-no-bar">${reason}</div>`}</div><span class="detail-delta">${valid?detailDiff(value,ref):'—'}</span></div></div>`;
}
function renderDetailPage({athlete:a,stageStats,ageStats,stageCount,ageCount,history,sample=false}){
 const years=detailAgeYears(a),stage=a.growth?.stage,previous=history.record,options={sample,stageKnown:!!stage,ageKnown:years!==null};
 text('detailIntro',`${a.n} 선수 · ${a.date} · 현재 점수 1~6점`);
 text('detailStageLabel',stage||'성장단계 확인 필요');
 text('detailAgeLabel',years===null?'나이 확인 필요':`만 ${years}세 · ${years}세 0~11개월`);
 text('detailStageGroup',sample?'가상 기준집단 · 지표별 예시 평균':stage?`${stageCount+100}건 · 같은 성장단계 기록`:'단계·PHV 확인 전 비교 보류');
 text('detailAgeGroup',sample?'측정일의 만 나이 기준 · 가상 평균':years===null?'유효한 나이 자료 확인 후 비교':`${ageCount}건 · 측정일의 같은 만 나이 기록`);
 $('detailSample').hidden=!sample;
 $('detailRows').innerHTML=DETAIL_METRICS.map((name,i)=>{const value=a.raw[name],change=detailChange(value,previous?.raw[name],history);return `<article class="detail-row" data-metric="${esc(name)}"><div><h3 class="detail-metric-name">${name}</h3><div class="detail-score ${detailValid(value)?'':'missing'}">${detailValid(value)?value.toFixed(1)+' <small>/ 6점</small>':'미측정'}</div></div>${detailBar(name,value,stageStats?.[name],'stage',options)}${detailBar(name,value,ageStats?.[name],'peer',options)}<div class="detail-change-cell"><div class="detail-change ${change.kind}" ${previous&&detailValid(value)&&detailValid(previous.raw[name])?`title="직전 ${previous.date}: ${previous.raw[name].toFixed(1)}점 → 이번 ${value.toFixed(1)}점"`:''}><span class="change-arrow" aria-hidden="true">${change.arrow}</span><span>${change.label}</span></div></div></article>`;}).join('');
 text('detailHistory',previous?`${previous.date} → ${a.date} · 지표별 원점수의 증감만 표시합니다.`:history.reason==='none'?'연결된 이전 측정 기록이 없습니다. 재측정 기록이 연결되면 향상·유지·저하를 표시합니다.':'선수 식별 정보·측정일·검사 버전을 확인한 뒤 이전 기록과 비교합니다.');
 text('detailNote',(sample?'이 페이지의 평균과 이력은 모두 가상 예시입니다. ':'본인 포함 기록 평균입니다. 성장단계 평균은 나이·성별을, 또래 평균은 성장단계·성별을 추가 보정하지 않았습니다. 지표별 유효 측정 건수를 사용하며 2건 미만은 비교를 보류하고 10건 미만은 소표본으로 표시합니다. ')+'두 막대는 각각 다른 집단과의 비교입니다. 중앙은 해당 평균, 눈금은 모두 −5~+5점입니다. 미측정은 0점으로 처리하지 않습니다. 향상·저하는 직전 점수의 증감이며 통계적 유의성이나 프로그램 효과를 뜻하지 않습니다.');
}
