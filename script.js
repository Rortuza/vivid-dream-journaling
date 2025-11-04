// Dream Journal AI, static version
// Storage in IndexedDB, analysis in JS, CSV export, offline ready

// Tiny sentiment, VADER-like compound using heuristic, good enough for MVP
const BOOST = { "not": -0.5, "never": -0.5 };
const POS = ["happy","laugh","love","kiss","win","sunny","peace","safe","calm"];
const NEG = ["fear","afraid","scared","chase","monster","die","doom","panic","scream","nightmare","angry","rage","yell","fight","furious","mad","cry","alone","loss","breakup","funeral","grief","tears"];
const EMO = {
  fear: ["fear","afraid","scared","chase","monster","die","doom","panic","scream","nightmare"],
  anger: ["angry","rage","yell","fight","furious","mad"],
  sad:   ["cry","alone","loss","breakup","funeral","grief","tears"],
  joy:   ["happy","laugh","love","kiss","win","sunny","peace","safe","calm"]
};

function sentiment(text){
  const t = text.toLowerCase();
  const words = t.match(/[a-z']{2,}/g) || [];
  let score = 0;
  for(let i=0;i<words.length;i++){
    const w = words[i];
    if(POS.includes(w)) score += 1;
    if(NEG.includes(w)) score -= 1;
    if(BOOST[w]) score += BOOST[w];
  }
  // normalize to -1..1
  const comp = Math.max(-1, Math.min(1, score / Math.max(1, words.length/12)));
  return comp;
}

function emotionPrimary(text){
  const t = text.toLowerCase();
  const counts = Object.fromEntries(Object.keys(EMO).map(k => [k,0]));
  for(const k in EMO){
    for(const w of EMO[k]) counts[k] += (t.split(w).length - 1);
  }
  let primary = "neutral";
  let best = 0;
  for(const k in counts){
    if(counts[k] > best){ best = counts[k]; primary = k; }
  }
  return primary;
}

function nightmareIndex(text, sent){
  const t = text;
  const fearHits = EMO.fear.reduce((acc,w)=>acc + (t.toLowerCase().split(w).length - 1), 0);
  const exclam = (t.match(/!/g) || []).length;
  const caps = (t.match(/[A-Z]/g) || []).length;
  const length = Math.max(t.length, 1);
  const capsRatio = caps / length;
  const neg = Math.max(0, -sent);
  const raw = 40*neg + 10*fearHits + 5*exclam + 30*capsRatio;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// IndexedDB
const DB_NAME = "dreams_static_db";
const DB_VER = 1;
let db;

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      const store = d.createObjectStore("entries", { keyPath: "id", autoIncrement: true });
      store.createIndex("dt", "dt");
    };
    req.onsuccess = e => { db = e.target.result; resolve(); };
    req.onerror = e => reject(e);
  });
}

function addEntry(entry){
  return new Promise((resolve,reject)=>{
    const tx = db.transaction("entries", "readwrite");
    tx.objectStore("entries").add(entry).onsuccess = ()=> resolve();
    tx.onerror = e => reject(e);
  });
}

function listEntries(){
  return new Promise((resolve,reject)=>{
    const tx = db.transaction("entries", "readonly");
    const store = tx.objectStore("entries");
    const req = store.getAll();
    req.onsuccess = ()=> resolve(req.result.sort((a,b)=> b.dt.localeCompare(a.dt)));
    req.onerror = e => reject(e);
  });
}

// UI
const cards = document.getElementById("cards");
const viewHome = document.getElementById("view-home");
const viewNew = document.getElementById("view-new");
const tabHome = document.getElementById("tab-home");
const tabNew = document.getElementById("tab-new");
const searchForm = document.getElementById("search-form");

tabHome.onclick = ()=> show("home");
tabNew.onclick = ()=> show("new");

function show(which){
  if(which === "home"){ viewHome.classList.remove("hidden"); viewNew.classList.add("hidden"); }
  else { viewNew.classList.remove("hidden"); viewHome.classList.add("hidden"); }
}

function cardHTML(e){
  return `
  <li class="card" data-id="${e.id}">
    <h3>${escapeHtml(e.title)}</h3>
    <p class="muted">${e.dt}</p>
    <p>Nightmare index: <strong>${e.nightmare_index}</strong>, Sentiment: ${e.sentiment.toFixed(2)}, Emotion: ${e.emotion_primary}</p>
    ${e.tags ? `<p class="tags">${escapeHtml(e.tags)}</p>` : ``}
    <p class="muted">Screen last hr: ${e.screen_min_last_hr} min, Caffeine: ${e.caffeine_mg} mg, Stress: ${e.stress_1_5}/5</p>
  </li>`;
}

function renderList(list){
  cards.innerHTML = list.map(cardHTML).join("");
  [...cards.querySelectorAll(".card")].forEach(li => li.onclick = ()=> openDetail(list.find(x => x.id == li.dataset.id)));
}

function openDetail(e){
  const dlg = document.getElementById("detail");
  document.getElementById("d-title").textContent = e.title;
  document.getElementById("d-dt").textContent = e.dt;
  document.getElementById("d-text").textContent = e.text;
  document.getElementById("d-tags").textContent = e.tags || "";
  document.getElementById("d-sent").textContent = e.sentiment.toFixed(2);
  document.getElementById("d-emotion").textContent = e.emotion_primary;
  document.getElementById("d-ni").textContent = e.nightmare_index;
  document.getElementById("d-screen").textContent = e.screen_min_last_hr;
  document.getElementById("d-caff").textContent = e.caffeine_mg;
  document.getElementById("d-meal").textContent = e.last_meal_min_before_sleep;
  document.getElementById("d-work").textContent = e.workout_min;
  document.getElementById("d-stress").textContent = e.stress_1_5;
  document.getElementById("d-lucid").textContent = e.lucid ? "yes" : "no";

  const recs = [];
  if(e.nightmare_index >= 60 && e.screen_min_last_hr >= 30) recs.push("Use grayscale and blue light filter 45 minutes before bed");
  if(e.emotion_primary === "fear") recs.push("Two minute box breathing before sleep");
  if(e.sentiment <= -0.3) recs.push("Write three lines about tomorrow's biggest worry, then close notebook");
  if(recs.length === 0) recs.push("Keep routine steady tonight");
  const ul = document.getElementById("d-recs");
  ul.innerHTML = recs.map(r => `<li>${escapeHtml(r)}</li>`).join("");

  dlg.showModal();
  document.getElementById("close-detail").onclick = ()=> dlg.close();
}

function escapeHtml(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// New entry
document.getElementById("new-form").onsubmit = async (e)=>{
  e.preventDefault();
  const title = document.getElementById("title").value.trim() || "Untitled";
  const text = document.getElementById("text").value.trim();
  const tags = document.getElementById("tags").value.trim();
  const screen = parseInt(document.getElementById("screen").value||"0",10);
  const caffeine = parseInt(document.getElementById("caffeine").value||"0",10);
  const meal = parseInt(document.getElementById("meal").value||"0",10);
  const workout = parseInt(document.getElementById("workout").value||"0",10);
  const stress = parseInt(document.getElementById("stress").value||"3",10);
  const lucid = document.getElementById("lucid").checked;

  const sent = sentiment(text);
  const emo = emotionPrimary(text);
  const ni = nightmareIndex(text, sent);

  const entry = {
    dt: new Date().toISOString().slice(0,16),
    title, text, tags,
    sentiment: sent,
    emotion_primary: emo,
    nightmare_index: ni,
    caffeine_mg: caffeine,
    last_meal_min_before_sleep: meal,
    screen_min_last_hr: screen,
    workout_min: workout,
    stress_1_5: stress,
    lucid: lucid
  };
  await addEntry(entry);
  await refresh();
  show("home");
  e.target.reset();
};

searchForm.onsubmit = async (e)=>{
  e.preventDefault();
  const q = document.getElementById("q").value.toLowerCase();
  const tag = document.getElementById("tag").value.toLowerCase();
  const all = await listEntries();
  const filtered = all.filter(r => {
    const hitQ = q ? (r.title.toLowerCase().includes(q) || r.text.toLowerCase().includes(q)) : true;
    const hitT = tag ? ((r.tags||"").toLowerCase().includes(tag)) : true;
    return hitQ && hitT;
  });
  renderList(filtered);
};

async function refresh(){
  const all = await listEntries();
  renderList(all);
}

document.getElementById("export").onclick = async ()=>{
  const all = await listEntries();
  const headers = ["id","dt","title","text","sentiment","emotion_primary","nightmare_index","tags","lucid","caffeine_mg","last_meal_min_before_sleep","screen_min_last_hr","workout_min","stress_1_5"];
  const rows = [headers.join(",")];
  all.forEach((e,i)=>{
    const row = [
      i+1,e.dt,qq(e.title),qq(e.text),e.sentiment.toFixed(3),e.emotion_primary,e.nightmare_index,
      qq(e.tags||""),e.lucid?1:0,e.caffeine_mg,e.last_meal_min_before_sleep,e.screen_min_last_hr,e.workout_min,e.stress_1_5
    ].join(",");
    rows.push(row);
  });
  const blob = new Blob([rows.join("\n")], {type: "text/csv"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "dreams_export.csv";
  a.click();
};

function qq(s){ return `"${(s||"").replace(/"/g,'""')}"`; }

// PWA
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=> navigator.serviceWorker.register("service-worker.js"));
}

// init
openDB().then(refresh);
