# coding: utf-8
"""Copy the report engine; import original records without overwriting existing charts."""
import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path
from datetime import datetime, timezone
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT.parent/'2026mental2'

def clean(value):
    return ' '.join(unicodedata.normalize('NFC',str(value or '')).split())

def digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()[:24]

def player_id(record):
    chart=clean(record.get('chart')).upper()
    key=['chart',chart,clean(record.get('birth')),clean(record.get('sex'))] if chart else ['identity',clean(record.get('n')).replace(' ',''),clean(record.get('birth')),clean(record.get('sex'))]
    return 'mrp-'+digest(key)

def report_id(record):
    source=record.get('source') or {}
    return 'mrr-'+digest([player_id(record),clean(record.get('date')),clean(source.get('file')),str(source.get('row') or ''),clean(record.get('type'))])

def source_data():
    html=(SOURCE/'index.html').read_text()
    match=re.search(r'const DATA=(\{.*?\});',html,re.S)
    if not match:raise ValueError('Original report DATA not found')
    return html,json.loads(match.group(1))

def prepare():
    import shutil
    html,data=source_data()
    target=ROOT/'reports'/'2026mental2'
    target.mkdir(parents=True,exist_ok=True)
    safe={**data,'athletes':[]}
    # Actual records live behind Firestore authorization, never in a public static HTML/JSON.
    html=re.sub(r'const DATA=\{.*?\};',lambda m:'const DATA='+json.dumps(safe,ensure_ascii=False,separators=(',',':'))+';',html,count=1,flags=re.S)
    html=html.replace('<script src="scripts/athlete_upload_ui.js"></script>','<script type="module" src="scripts/firebase_report.js"></script>')
    html=html.replace('이름·생년월일·성별이 같은 선수는 제외하고 새 선수만 추가합니다. 같은 차트번호·생년월일·성별도 중복으로 확인합니다. 파일 안의 중복 선수는 최신 유효 기록 1건만 추가합니다. 저장은 현재 브라우저에만 적용되며 다른 기기와 공유되지 않습니다.','선수 Excel (.xlsx)을 Firebase에 저장합니다. 리포트 목록에 저장하며, 관리 선수 등록은 워크스페이스의 선수 등록창에서 별도로 진행합니다.')
    html=html.replace('list.length+(!query&&!delayedOnly?500:0)','list.length').replace('ATH.length+500','ATH.length')
    html=html.replace("n+(kind==='stage'&&options.stageKnown&&!options.sample?100:0)",'n')
    html=html.replace('</head>', '<link rel="stylesheet" href="../../resources/report-score-notice.css"></head>',1)
    html=html.replace('</head>','<style>.sheet,.summary,.player-card{border-radius:5px!important}.toolbar{flex-wrap:wrap}.toolbar input,.toolbar select,.toolbar button{border-radius:5px}</style></head>',1)
    html=html.replace('</body>','<script src="../../resources/report-score-notice.js"></script></body>',1)
    (target/'index.html').write_text(html)
    shutil.copytree(SOURCE/'assets',target/'assets',dirs_exist_ok=True,ignore=shutil.ignore_patterns('field-candidates*'))
    for name in ['athlete_import.js','mental_detail_charts.js','mental_detail.css']:
        src=SOURCE/'scripts'/name
        if src.exists():shutil.copy2(src,target/'scripts'/name)
    return data

def migrate(apply=False):
    sys.path.insert(0,str(ROOT))
    import server
    server.load_env()
    import firebase_admin
    from firebase_admin import firestore
    app=firebase_admin.initialize_app(options={'projectId':'mpsreserve'},name='mental2-migration')
    db=firestore.client(app=app)
    _,data=source_data()
    records=data['athletes'];players={};reports={};now=datetime.now(timezone.utc).isoformat()
    for record in records:
        pid=player_id(record);rid=report_id(record)
        if rid in reports and reports[rid]['record']!=record:raise ValueError('Conflicting source report identity; migration stopped')
        reports[rid]={'id':rid,'playerId':pid,'date':record.get('date',''),'record':record,'source':'2026mental2','createdAt':now,'updatedAt':now}
        if pid not in players:
            players[pid]={'id':pid,'name':record['n'],'birth':record.get('birth',''),'sex':record.get('sex',''),'number':record.get('chart',''),'organization':record.get('team',''),'program':'멘탈강화','coach':'','active':True,'source':'2026mental2','createdAt':now,'updatedAt':now,'reportIds':[],'reportUrl':'./reports/2026mental2/index.html?player='+pid}
        players[pid]['reportIds'].append(rid)
    print('Source reports:',len(records),'Unique players:',len(players),'Unique reports:',len(reports))
    existing_players={s.id:s.to_dict() for s in db.collection('mental_report_players').stream()}
    existing_reports={s.id:s.to_dict() for s in db.collection('mental_reports').stream()}
    # Snapshot existing charts locally outside any sync/web root before applying.
    if apply:
        backup=Path.home()/'.config'/'sportsmps'/'backups';backup.mkdir(parents=True,exist_ok=True);backup.chmod(0o700)
        snapshot={c:{s.id:s.to_dict() for s in db.collection(c).stream()} for c in ['mental_players','mental_report_players','mental_sessions','mental_summaries','mental_reports']}
        path=backup/('mental-before-merge-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
        path.write_text(json.dumps(snapshot,ensure_ascii=False,default=str));path.chmod(0o600)
    writes=[]
    for pid,value in players.items():
        if pid not in existing_players:writes.append((db.collection('mental_report_players').document(pid),value))
    for rid,value in reports.items():
        if rid not in existing_reports:writes.append((db.collection('mental_reports').document(rid),value))
    print('New documents:',len(writes),'Existing chart players preserved:',len(existing_players))
    if apply:
        for start in range(0,len(writes),400):
            batch=db.batch()
            for ref,value in writes[start:start+400]:batch.create(ref,value)
            batch.commit()
        print('Migration verified:',sum(1 for _ in db.collection('mental_reports').stream()),'stored reports')
    return len(players),len(reports)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--prepare',action='store_true');parser.add_argument('--apply',action='store_true');args=parser.parse_args()
    if args.prepare:prepare();print('Report engine copied; embedded personal data removed')
    else:migrate(args.apply)
