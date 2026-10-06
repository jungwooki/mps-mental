# coding: utf-8
"""Separate report roster; retain any auto-imported profile that acquired user work."""
import sys,json
from pathlib import Path
from datetime import datetime,timezone
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));import server;server.load_env()
sys.path.insert(0,str(Path(__file__).parent));from import_mental2 import source_data,player_id,report_id
import firebase_admin
from firebase_admin import firestore
app=firebase_admin.initialize_app(options={'projectId':'mpsreserve'},name='separate-report-roster');db=firestore.client(app=app)
_,source=source_data();roster={};now=datetime.now(timezone.utc).isoformat()
for record in source['athletes']:
 pid=player_id(record)
 if pid not in roster:roster[pid]={'id':pid,'name':record['n'],'birth':record.get('birth',''),'sex':record.get('sex',''),'number':record.get('chart',''),'organization':record.get('team',''),'source':'2026mental2','reportIds':[],'createdAt':now,'updatedAt':now}
 roster[pid]['reportIds'].append(report_id(record))
backup=Path.home()/'.config'/'sportsmps'/'backups';backup.mkdir(parents=True,exist_ok=True);backup.chmod(0o700)
original={c:{s.id:s.to_dict() for s in db.collection(c).stream()} for c in ['mental_players','mental_report_players','mental_sessions','mental_summaries','mental_reports']}
p=backup/('mental-before-roster-separation-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json');p.write_text(json.dumps(original,ensure_ascii=False,default=str));p.chmod(0o600)
writes=[(pid,value) for pid,value in roster.items() if pid not in original['mental_report_players']]
for start in range(0,len(writes),400):
 batch=db.batch()
 for pid,value in writes[start:start+400]:batch.create(db.collection('mental_report_players').document(pid),value)
 batch.commit()
print('Report roster copied:',len(roster),flush=True)
@firestore.transactional
def separate(transaction,pid):
 ref=db.collection('mental_players').document(pid);snap=ref.get(transaction=transaction)
 if not snap.exists:return 'absent'
 data=snap.to_dict()
 if data.get('source')!='2026mental2' or data.get('managed') is True or data.get('createdAt')!=data.get('updatedAt') or data.get('note') or data.get('diaryNote') or data.get('coach'):
  return 'retained'
 sessions=list(db.collection('mental_sessions').where(filter=firestore.FieldFilter('playerId','==',pid)).limit(1).stream(transaction=transaction))
 summary=db.collection('mental_summaries').document(pid).get(transaction=transaction)
 if sessions or summary.exists:return 'retained'
 transaction.delete(ref);return 'separated'
def run(pid):return separate(db.transaction(),pid)
with ThreadPoolExecutor(max_workers=8) as pool:
 results=list(pool.map(run,roster))
print('Untouched auto-registrations removed:',results.count('separated'))
print('Profiles with user work retained:',results.count('retained'))
print('Managed roster count:',sum(1 for _ in db.collection('mental_players').stream()))
print('Report records preserved:',sum(1 for _ in db.collection('mental_reports').stream()))
