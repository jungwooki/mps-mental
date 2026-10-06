"""Loopback-only browser fixture. Never connects to Firebase/OpenAI. Not a production server."""
import json
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
ROOT=Path(__file__).resolve().parent.parent
DATA={'mental_players':{'p1':{'id':'p1','name':'테스트 선수 A','number':'A001','organization':'테스트 팀','active':True},'p2':{'id':'p2','name':'테스트 선수 B','number':'B002','active':True}},'mental_sessions':{'s1':{'id':'s1','playerId':'p1','date':'2026-10-01','note':'기존 상담 메모'},'s2':{'id':'s2','playerId':'p1','date':'2026-10-02','note':'두 번째 회차'},'s3':{'id':'s3','playerId':'p2','date':'2026-10-02','note':'선수 B 메모'}},'mental_summaries':{}}
DATA['mental_report_players']={'r1':{'id':'r1','name':'리포트 선수','number':'R001','birth':'2000-01-01','sex':'남'},'r2':{'id':'r2','name':'리포트 선수','number':'R002','birth':'2001-01-01','sex':'여'}}
DATA['mental_players']['p1'].update({'reportSourcePlayerId':'r1','birth':'2000-01-01'})
raw={k:4 for k in ['경기긴장도','사회적 도움 활용','경기 준비 능력','실수 후 회복력','자기 통제력','경기 안정성','경기 중 감정 조절','외부평가 독립성','자기주도 학습능력','이미지트레이닝 활용능력','주위 적응 및 활용 능력','실패 후 회복력','훈련 태도 지수']}
DATA['mental_reports']={'report1':{'playerId':'r1','date':'2026-10-01','record':{'date':'2026-10-01','type':'D','growth':{'stage':'가속기','boneMonths':144,'chronologicalMonths':156,'differenceMonths':-12},'raw':{**raw,'경기긴장도':5.5,'훈련 태도 지수':2}}},'report2':{'playerId':'r2','date':'2026-09-30','record':{'date':'2026-09-30','type':'A','growth':{'stage':'가속기'},'raw':raw}}}
APP="export const getApps=()=>[];export const initializeApp=()=>({});"
AUTH="""const user={uid:'test-coach',isAnonymous:false,getIdToken:async()=> 'test-only',getIdTokenResult:async()=>({claims:{mentalCoach:true,mentalAdmin:true}})};export const getAuth=()=>({currentUser:user,authStateReady:async()=>{}});export const onAuthStateChanged=()=>()=>{};export const signInAnonymously=async()=>{};export const signInWithEmailAndPassword=async()=>{};export const signOut=async()=>{};"""
FIRESTORE="""export async function getDocs(name){const v=await fetch("/test-data/"+name).then(r=>r.json());return {docs:Object.entries(v).map(([id,data])=>({id,data:()=>data}))};}export async function getDoc(ref){const v=await fetch('/test-data/'+ref.name).then(r=>r.json());return {exists:()=>!!v[ref.id],data:()=>v[ref.id]};}export async function runTransaction(db,fn){return fn({get:getDoc,update:(ref,data)=>setDoc(ref,data)});}export const getFirestore=()=>({});export const collection=(db,name)=>name;export const doc=(db,name,id)=>({name,id});export const query=(s)=>s;export const where=()=>{};export const documentId=()=> '__name__';export function onSnapshot(name,opts,callback){let alive=true;fetch('/test-data/'+name).then(r=>r.json()).then(value=>{if(alive)callback({metadata:{fromCache:false},forEach:fn=>Object.entries(value).forEach(([id,data])=>fn({id,data:()=>data}))})});return()=>alive=false;}export async function setDoc(ref,data){if(window.fixtureSaveFailure)throw {code:'permission-denied'};const r=await fetch('/test-save/'+ref.name+'/'+ref.id,{method:'POST',body:JSON.stringify(data)});if(!r.ok)throw {code:'unavailable'};}"""
class Handler(SimpleHTTPRequestHandler):
    def send(self,data,mime='application/json',status=200):
        if not isinstance(data,bytes):data=(data if isinstance(data,str) else json.dumps(data,ensure_ascii=False)).encode()
        self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def do_GET(self):
        path=self.path.split('?')[0]
        modules={'/test-firebase/firebase-app.js':APP,'/test-firebase/firebase-auth.js':AUTH,'/test-firebase/firebase-firestore.js':FIRESTORE}
        if path in modules:return self.send(modules[path],'text/javascript')
        if path.endswith('/firebase-diary.js'):return self.send((ROOT/'resources/20260916 diary/firebase-diary.js').read_text().replace('https://www.gstatic.com/firebasejs/11.6.1/','/test-firebase/'),'text/javascript')
        if path=='/mps-mental/app.js':return self.send((ROOT/'app.js').read_text().replace('https://www.gstatic.com/firebasejs/11.6.1/','/test-firebase/'),'text/javascript')
        if path.startswith('/test-data/'):return self.send(DATA[path.rsplit('/',1)[-1]])
        if path.endswith('/api/health'):return self.send({'ready':True})
        super().do_GET()
    def do_POST(self):
        body=self.rfile.read(int(self.headers.get('Content-Length','0')))
        if self.path.startswith('/test-save/'):
            _,_,name,id=self.path.split('/');DATA[name][id]={**DATA[name].get(id,{}),**json.loads(body)};return self.send({'ok':True})
        binding={'playerId':self.headers.get('X-Player-ID'),'sessionId':self.headers.get('X-Session-ID')}
        if self.path.endswith('/api/transcribe'):return self.send({**binding,'transcript':'선수: 실수 후 집중력이 떨어집니다. 코치: 리셋 루틴을 사용해 보세요.'})
        if self.path.endswith('/api/consultation-summary'):return self.send({**binding,'summary':{'issues':['실수 후 집중 저하'],'selfAwareness':['선수는 집중력 저하를 보고함'],'gameTraining':[],'coaching':['코치가 리셋 루틴을 제안함'],'followUp':['리셋 루틴 사용 여부 확인']}})
        if self.path.endswith('/api/summary'):return self.send({'text':'테스트 최근 회차 요약','model':'fixture'})
        self.send({'error':'not found'},status=404)
if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',8790),partial(Handler,directory=str(ROOT.parent))).serve_forever()
