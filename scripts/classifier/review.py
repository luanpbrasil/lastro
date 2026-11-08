"""Local review page for the human-checked sample (split.json → "review").

    scripts/classifier/.venv/bin/python -I scripts/classifier/review.py   → http://127.0.0.1:8791

Shows each video's title, description and captions (if any) with Haiku's labels pre-ticked.
Saves to data/classifier/review.json (video id → labels; committed). Resumable.
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data/classifier/raw"
OUT = ROOT / "data/classifier/review.json"
LABELS = ["economia", "politica", "filosofia"]


def load():
    videos = json.loads((RAW / "videos.json").read_text())
    haiku = json.loads((RAW / "haiku_labels.json").read_text())
    split = json.loads((ROOT / "data/classifier/split.json").read_text())
    chans = {c["id"]: (c.get("title") or h) for h, c in json.loads((RAW / "channels.json").read_text()).items()}
    items = []
    for vid in split["review"]:
        v = videos[vid]
        cp = RAW / "captions" / f"{vid}.json"
        cap = json.loads(cp.read_text()) if cp.exists() else {"status": "none"}
        text = " ".join(s["t"] for s in cap.get("segments", [])) if cap["status"] == "ok" else ""
        h = haiku.get(vid, {})
        items.append({"id": vid, "title": v["title"], "channel": chans.get(v["channel"], ""), "description": v["description"][:1500],
                      "captions": text, "haiku": {k: bool(h.get(k)) for k in LABELS}, "why": h.get("motivo", ""), "conf": h.get("confianca", "")})
    return items


PAGE = """<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Revisão de temas</title>
<style>
body{font:15px/1.45 -apple-system,system-ui,sans-serif;margin:0;background:#F4F5F7;color:#16203A}
main{max-width:860px;margin:24px auto;padding:0 16px}
.card{background:#fff;border:1px solid #DADEE6;border-radius:12px;padding:20px;display:grid;gap:12px}
h1{font-size:19px;margin:0}.meta{color:#5A6378;font-size:13px}
.box{background:#F7F8FA;border-radius:8px;padding:10px 12px;font-size:13.5px;white-space:pre-wrap;max-height:200px;overflow:auto}
.labels{display:flex;gap:10px;flex-wrap:wrap}
.labels label{border:1px solid #DADEE6;border-radius:99px;padding:8px 14px;cursor:pointer;user-select:none}
.labels input{margin-right:6px}.labels label.on{background:#FFF4D6;border-color:#E0B000}
.haiku{font-size:13px;color:#5A6378}
.bar{display:flex;justify-content:space-between;align-items:center;gap:8px}
button{font:inherit;border:1px solid #DADEE6;background:#fff;border-radius:8px;padding:8px 14px;cursor:pointer}
button.primary{background:#FFD23F;border-color:#FFD23F}
.k{font:12px ui-monospace,Menlo,monospace;color:#5A6378}
.prog{height:6px;background:#E6E9F2;border-radius:3px;overflow:hidden}.prog i{display:block;height:100%;background:#2B55D6}
</style>
<main>
<p class="k">Marque os temas do vídeo. Nenhum marcado = nenhum dos três. Atalhos: 1 economia · 2 política · 3 filosofia · Enter salvar e seguir · ← voltar.<br>
Economia: explica/debate a economia (finanças pessoais só se a maior parte explica a economia). Política: notícia/análise política (humor sem análise não conta). Filosofia: ideias filosóficas (autoajuda não conta).</p>
<div class="prog"><i id="pg"></i></div><p class="k" id="count"></p>
<div class="card" id="card"></div>
</main>
<script>
const ITEMS = __ITEMS__; let saved = __SAVED__; let i = 0;
const L = ["economia","politica","filosofia"], NAMES = {economia:"Economia",politica:"Política",filosofia:"Filosofia"};
const firstOpen = () => { const k = ITEMS.findIndex(it => !saved[it.id]); return k < 0 ? ITEMS.length - 1 : k; };
i = firstOpen();
function esc(s){return s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}
function render(){
  const it = ITEMS[i], cur = saved[it.id] || it.haiku, done = Object.keys(saved).length;
  document.getElementById("pg").style.width = (100*done/ITEMS.length)+"%";
  document.getElementById("count").textContent = `${i+1} / ${ITEMS.length} · revisados ${done}`;
  const c = document.getElementById("card");
  c.innerHTML = `<div class="meta">${esc(it.channel)} · <a href="https://www.youtube.com/watch?v=${it.id}" target="_blank" rel="noopener">abrir no YouTube</a>${saved[it.id] ? " · ✓ revisado" : ""}</div>
  <h1>${esc(it.title)}</h1>
  <div class="box">${esc(it.description || "(sem descrição)")}</div>
  ${it.captions ? `<div class="box">${esc(it.captions)}</div>` : `<div class="k">(sem legendas)</div>`}
  <div class="haiku">Haiku: ${L.filter(k=>it.haiku[k]).map(k=>NAMES[k]).join(" + ") || "nenhum"} · confiança ${esc(it.conf)} · ${esc(it.why)}</div>
  <div class="labels">${L.map((k,n)=>`<label class="${cur[k]?"on":""}"><input type="checkbox" data-k="${k}" ${cur[k]?"checked":""}>${n+1} ${NAMES[k]}</label>`).join("")}</div>
  <div class="bar"><button id="prev">← voltar</button><button class="primary" id="next">Salvar e seguir →</button></div>`;
  c.querySelectorAll("input").forEach(x => x.onchange = () => x.parentElement.classList.toggle("on", x.checked));
  document.getElementById("prev").onclick = () => { if (i > 0) { i--; render(); } };
  document.getElementById("next").onclick = save;
}
async function save(){
  const it = ITEMS[i], lab = {};
  document.querySelectorAll("#card input").forEach(x => lab[x.dataset.k] = x.checked);
  const r = await fetch("/save", {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({id: it.id, labels: lab})});
  if (!r.ok) { alert("Falha ao salvar"); return; }
  saved[it.id] = lab;
  if (i < ITEMS.length - 1) i++;
  render();
}
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" && e.key === " ") return;
  const n = {"1":0,"2":1,"3":2}[e.key];
  if (n !== undefined) { const x = document.querySelectorAll("#card input")[n]; x.checked = !x.checked; x.onchange(); }
  else if (e.key === "Enter") save();
  else if (e.key === "ArrowLeft" && i > 0) { i--; render(); }
});
render();
</script></html>"""


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        saved = json.loads(OUT.read_text()) if OUT.exists() else {}
        body = PAGE.replace("__ITEMS__", json.dumps(load(), ensure_ascii=False).replace("</", "<\\/")) \
                   .replace("__SAVED__", json.dumps({k: v["labels"] for k, v in saved.items()}))
        self.send_response(200)
        self.send_header("content-type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body.encode())

    def do_POST(self):
        if self.path != "/save":
            self.send_response(404); self.end_headers(); return
        data = json.loads(self.rfile.read(int(self.headers["content-length"])))
        labels = {k: bool(data["labels"].get(k)) for k in LABELS}
        saved = json.loads(OUT.read_text()) if OUT.exists() else {}
        saved[data["id"]] = {"labels": labels}
        OUT.write_text(json.dumps(dict(sorted(saved.items())), indent=1))
        self.send_response(204); self.end_headers()


if __name__ == "__main__":
    print("review page: http://127.0.0.1:8791")
    ThreadingHTTPServer(("127.0.0.1", 8791), H).serve_forever()
