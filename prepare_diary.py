# coding: utf-8
"""Keep the existing diary UI and add athlete-specific Firebase synchronization."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def apply_diary_bridge():
    target=ROOT/'resources'/'20260916 diary'
    app=target/'app.js'
    text=app.read_text()
    text=text.replace("const key='mps-diary-v1';", "const linkedPlayer=new URLSearchParams(location.search).get('player');\nconst key=linkedPlayer?'mps-diary-player-'+linkedPlayer:'mps-diary-v1';")
    text=text.replace('localStorage.setItem(key,JSON.stringify(db));return true', "localStorage.setItem(key,JSON.stringify(db));window.dispatchEvent(new Event('mps-diary-saved'));return true")
    text=text.replace("if('serviceWorker'in navigator&&location.protocol.startsWith('http'))", "if(!linkedPlayer&&'serviceWorker'in navigator&&location.protocol.startsWith('http'))")
    old='기록은 이 기기의 현재 브라우저에 저장돼요. 브라우저 데이터를 지우면 사라질 수 있어요. 다른 기기나 선생님에게 자동으로 전송되지 않아요.'
    if "${linkedPlayer?" not in text:
        text=text.replace(old,"${linkedPlayer?'선수별 기록은 이 기기에 임시 저장하고 Firebase에 저장되면 코치 차팅에 연결돼요. 상단 저장 상태를 확인해 주세요.':'"+old+"'}")
    app.write_text(text)
    index=target/'index.html';html=index.read_text()
    if 'firebase-diary.js' not in html:html=html.replace('</body>','<script type="module" src="firebase-diary.js"></script></body>')
    index.write_text(html)
    css=target/'refresh.css';text=css.read_text()
    if '.diary-cloud-banner' not in text:text+='\n.diary-cloud-banner{position:sticky;top:0;z-index:50;background:#eaf4f0;color:#235946;padding:10px 18px;font-size:13px;border-bottom:1px solid #d3e1db}\n'
    css.write_text(text)

if __name__=='__main__':apply_diary_bridge()
