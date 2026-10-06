/* MPS authoring workbook -> existing growth/mental report model. */
(function (root) {
  'use strict';
  const CORE = ['경기긴장도','사회적 도움 활용','경기 준비 능력','실수 후 회복력','자기 통제력'];
  const METRICS = [...CORE,'경기 안정성','경기 중 감정 조절','외부평가 독립성','자기주도 학습능력','이미지트레이닝 활용능력','주위 적응 및 활용 능력','실패 후 회복력','훈련 태도 지수'];
  const AXES = {P:['경기긴장도','경기 안정성','경기 중 감정 조절','실패 후 회복력'],R:['경기 준비 능력','자기주도 학습능력','이미지트레이닝 활용능력'],I:['실수 후 회복력','외부평가 독립성']};
  const STAGES = {'Pre-PHV':'급성장 이전','Stage 1':'가속기','Stage 2':'급성장기','Stage 3':'감속기','Stage 4':'종료기'};
  const PHV = {'Pre-PHV':'PHV -2','Stage 1':'PHV -1','Stage 2':'PHV 0','Stage 3':'PHV 1','Stage 4':'PHV 2'};
  const clean = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/g,' ');
  const key = a => JSON.stringify([clean(a.n).replace(/\s/g,''),a.birth,clean(a.sex)]);
  const chartKey = a => a.chart ? JSON.stringify([clean(a.chart).toUpperCase(),a.birth,clean(a.sex)]) : null;
  const number = value => clean(value) === '' ? NaN : Number(value);
  const validScore = value => Number.isFinite(value) && value >= 1 && value <= 6;
  function cellValue(cell) {
    const v = cell.value;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('formula' in v || 'sharedFormula' in v) return v.result ?? '';
      if (v.richText) return v.richText.map(t=>t.text).join('');
      if (v.text) return v.text;
      return '';
    }
    return v ?? '';
  }
  function date(value, date1904 = false) {
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0,10) : '';
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value < (date1904 ? 0 : 1) || value > 100000) return '';
      const days = date1904 ? value : value - (value >= 60 ? 1 : 0);
      return new Date(Date.UTC(date1904 ? 1904 : 1899,date1904 ? 0 : 11,date1904 ? 1 : 31)+Math.floor(days)*86400000).toISOString().slice(0,10);
    }
    const match = clean(value).match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T].*)?$/);
    if (!match) return '';
    const [,y,m,d] = match.map(Number), out = new Date(Date.UTC(y,m-1,d));
    return out.getUTCFullYear()===y && out.getUTCMonth()===m-1 && out.getUTCDate()===d ? out.toISOString().slice(0,10) : '';
  }
  function ageMonths(birth, measured) {
    const b = new Date(birth), d = new Date(measured);
    let months = (d.getUTCFullYear()-b.getUTCFullYear())*12+d.getUTCMonth()-b.getUTCMonth();
    const anniversary = n => {
      const first = new Date(Date.UTC(b.getUTCFullYear(),b.getUTCMonth()+n,1));
      const last = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
      return new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(b.getUTCDate(),last)));
    };
    if (anniversary(months)>d) months--;
    return months+(d-anniversary(months))/(anniversary(months+1)-anniversary(months));
  }
  function toRecord(get, types, source, date1904) {
    const n=clean(get('선수명')), birth=date(get('생년월일'),date1904), measured=date(get('측정일'),date1904);
    const sex=({M:'남',F:'여',남성:'남',여성:'여',남자:'남',여자:'여'})[clean(get('성별')).toUpperCase()] || clean(get('성별'));
    if (!n || !birth || !measured || !['남','여'].includes(sex) || birth>=measured) throw new Error('선수명·성별·생년월일·측정일 확인 필요');
    if (/sample|샘플|예시/i.test(n+' '+clean(get('소속팀')))) throw new Error('샘플·예시 데이터');
    const raw=Object.fromEntries(METRICS.map(k=>[k,number(get(k))])), mgi=number(get('MGI'));
    if (![mgi,...Object.values(raw)].every(validScore)) throw new Error('MGI 및 멘탈 13지표는 1~6점의 숫자가 필요합니다');
    // Scaled integers avoid floating-point drift at the existing 4.5 threshold.
    const axes=Object.fromEntries(Object.entries(AXES).map(([k,names])=>[k,names.reduce((sum,n)=>sum+Math.round(raw[n]*1e8),0)/names.length/1e8]));
    const code=Object.values(axes).map(v=>v>=4.5?'H':'L').join('');
    const type=Object.keys(types).find(k=>types[k].code===code);
    if (!type) throw new Error('멘탈 유형 기준을 찾을 수 없습니다');
    const near=Object.values(types).map(t=>Math.round(100*(1-Math.sqrt(Object.keys(axes).reduce((s,k)=>s+(axes[k]-t.bench[k])**2,0)/3)/5)));
    const priority=['실수 후 회복력','경기 준비 능력','경기긴장도','자기 통제력','사회적 도움 활용'];
    const strengths=CORE.filter(k=>raw[k]>=4.8), strongest=CORE.reduce((a,b)=>raw[a]>=raw[b]?a:b);
    const eligible=priority.filter(k=>raw[k]<4.8 && (strengths.length || k!==strongest));
    const next=!eligible.length?'심화: '+priority.reduce((a,b)=>raw[a]<=raw[b]?a:b):Math.max(...eligible.map(k=>raw[k]))>=4.5?eligible.reduce((a,b)=>raw[a]>=raw[b]?a:b):eligible[0];
    const ca=ageMonths(birth,measured), by=number(get('골연령 (년)')), bm=number(get('골연령 (개월)')), ba=by*12+bm;
    const valid=Number.isInteger(by)&&Number.isInteger(bm)&&bm>=0&&bm<12&&ba>=48&&ba<=240&&Math.abs(ba-ca)<=48;
    const stageRaw=clean(get('성장 단계')), phvRaw=clean(get('PHV 단계')), stageOK=Object.hasOwn(STAGES,stageRaw)&&PHV[stageRaw]===phvRaw;
    return {n,birth,sex,date:measured,chart:clean(get('차트번호')),team:clean(get('소속팀')),mgi,raw,axes,code,type,typeName:types[type].name,near,
      core:Object.fromEntries(CORE.map(k=>[k,raw[k]])),strength:strengths.join(', ')||'가장 높은 지표: '+strongest,next,phv:phvRaw,source,
      growth:{chronologicalMonths:ca,boneYearsRaw:clean(get('골연령 (년)')),boneMonthsRaw:clean(get('골연령 (개월)')),boneMonths:valid?ba:null,differenceMonths:valid?ba-ca:null,delayed:valid&&ba-ca<=-6,stageRaw,phvRaw,stage:stageOK?STAGES[stageRaw]:null,height:clean(get('현재 키 (cm)')),weight:clean(get('현재 체중 (kg)')),issues:[...(!valid?['골연령 원자료 재확인']:[]),...(!stageOK?['성장단계·PHV 불일치']:[])],source}};
  }
  function parseWorkbook(workbook, existing, types, filename) {
    const required=['선수명','성별','생년월일','측정일','MGI',...METRICS];
    let sheet, headerRow, headers;
    for (const candidate of workbook.worksheets) {
      for (let r=1;r<=Math.min(candidate.rowCount,20);r++) {
        const map=new Map(); candidate.getRow(r).eachCell((cell,col)=>map.set(clean(cellValue(cell)),col));
        if (required.every(k=>map.has(k))) { sheet=candidate; headerRow=r; headers=map; break; }
      }
      if (sheet) break;
    }
    if (!sheet) throw new Error('MPS 입력값 Excel 양식이 아닙니다. 선수명·생년월일·측정일·MGI·멘탈 13지표 열을 확인해 주세요.');
    const candidates=[],errors=[];
    for (let r=headerRow+1;r<=sheet.rowCount;r++) {
      const row=sheet.getRow(r); if (!row.hasValues) continue;
      const get=k=>headers.has(k)?cellValue(row.getCell(headers.get(k))):'';
      if (![...headers.keys()].some(k=>clean(get(k)))) continue;
      try { candidates.push(toRecord(get,types,{file:filename,row:r,sheet:sheet.name},workbook.properties.date1904)); }
      catch(error) { errors.push({row:r,reason:error.message}); }
    }
    candidates.sort((a,b)=>b.date.localeCompare(a.date)||a.source.row-b.source.row);
    const identities=new Set(existing.map(key)), charts=new Set(existing.map(chartKey).filter(Boolean)), added=[];
    let duplicate=0;
    for (const a of candidates) {
      if (identities.has(key(a)) || (chartKey(a)&&charts.has(chartKey(a)))) { duplicate++; continue; }
      identities.add(key(a)); if(chartKey(a)) charts.add(chartKey(a)); added.push(a);
    }
    return {added,duplicate,errors,total:candidates.length+errors.length};
  }
  root.MPSAthleteImport={parseWorkbook,key,chartKey,date,ageMonths};
  if(typeof module!=='undefined') module.exports=root.MPSAthleteImport;
})(globalThis);
