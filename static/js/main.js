/* HemoSense frontend — harish theme: sliders, globe hero metric, fetch predict, monochrome charts. */
const FIELDS = [
  {k:'Age', min:1, max:90, step:1, def:32, unit:'y'},
  {k:'Haemoglobin', min:5, max:18, step:0.1, def:11.5, unit:'g/dL'},
  {k:'MCV', min:60, max:110, step:0.5, def:86, unit:'fL'},
  {k:'MCH', min:15, max:36, step:0.1, def:28.5, unit:'pg'},
  {k:'MCHC', min:28, max:36, step:0.1, def:33, unit:'g/dL'},
  {k:'RDW', min:11, max:20, step:0.1, def:13.5, unit:'%'},
  {k:'RBC', min:2.5, max:6.5, step:0.05, def:4.4, unit:'×10¹²/L'},
  {k:'HCT', min:15, max:55, step:0.5, def:36, unit:'%'},
  {k:'Ferritin', min:3, max:350, step:1, def:60, unit:'ng/mL'},
];
const grid = document.getElementById('slider-grid');
const srvForm = (window.HEMO && window.HEMO.serverForm) || null;
FIELDS.forEach(f => {
  const init = srvForm && srvForm[f.k] !== '' && srvForm[f.k] != null ? Number(srvForm[f.k]) : f.def;
  const div = document.createElement('div');
  div.className = 'field';
  div.innerHTML = `<div class="frow"><label>${f.k} (${f.unit})</label><span class="fval" id="v-${f.k}">${init}</span></div>
    <input type="range" id="in-${f.k}" name="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${init}">`;
  grid.appendChild(div);
  const slider = div.querySelector('input');
  const badge = div.querySelector('.fval');
  slider.addEventListener('input', () => { badge.textContent = slider.value; });
});
if (srvForm && srvForm.Gender) { const g = document.getElementById('in-Gender'); if (g) g.value = srvForm.Gender; }
if (srvForm && srvForm.Name) { const n = document.getElementById('in-Name'); if (n) n.value = srvForm.Name; }

// hero metric: champion accuracy (harish gradient number)
(function(){
  const m = (window.HEMO && window.HEMO.metrics && window.HEMO.metrics.results) || {};
  let best = -1;
  Object.values(m).forEach(r => { if(r.accuracy > best) best = r.accuracy; });
  if(best > 0) document.getElementById('m-acc').textContent = (best*100).toFixed(2) + '%';
})();

// demo presets
document.getElementById('demo-anaemic').onclick = () => {
  const v = {Age:24,Gender:'Female',Haemoglobin:9.4,MCV:71,MCH:22,MCHC:30,RDW:16.5,RBC:3.5,HCT:29,Ferritin:11};
  Object.entries(v).forEach(([k,val])=>{ const el=document.getElementById('in-'+k); if(el){el.value=val; el.dispatchEvent(new Event('input'));} });
};
document.getElementById('demo-healthy').onclick = () => {
  const v = {Age:30,Gender:'Male',Haemoglobin:15,MCV:90,MCH:30,MCHC:34,RDW:12.5,RBC:5.2,HCT:44,Ferritin:120};
  Object.entries(v).forEach(([k,val])=>{ const el=document.getElementById('in-'+k); if(el){el.value=val; el.dispatchEvent(new Event('input'));} });
};

Chart.defaults.color = '#9297a0';
Chart.defaults.borderColor = '#18191b';
Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
let lastResult = null, lastInputs = null;

function hbar(canvas, labels, values, title){
  if(canvas._chart) canvas._chart.destroy();
  const colors = values.map(v => v >= 0 ? '#fafafa' : '#52525b');
  canvas._chart = new Chart(canvas, {type:'bar',
    data:{labels, datasets:[{data:values, backgroundColor:colors, borderRadius:6, barThickness:12}]},
    options:{indexAxis:'y', plugins:{legend:{display:false}, title:{display:!!title,text:title||'',color:'#fff'}},
      scales:{x:{grid:{color:'#18191b'}, ticks:{color:'#6b707a'}}, y:{grid:{display:false}, ticks:{color:'#adb1b8'}}}, animation:{duration:900, easing:'easeOutQuart'}}});
}

// full clinical explanation: every feature vs reference range
function analyzeFeatures(inp){
  const male = String(inp.Gender || '').toLowerCase().startsWith('m');
  const rows = [];
  const row = (f, v, s, c, n) => rows.push({ f, v, s, c, n });
  const hbCut = male ? 13 : 12;
  row('Haemoglobin', inp.Haemoglobin + ' g/dL',
    inp.Haemoglobin < hbCut ? 'Low' : 'Normal', inp.Haemoglobin < hbCut ? 'st-low' : 'st-ok',
    inp.Haemoglobin < hbCut
      ? `Below the ${hbCut} g/dL cutoff (${male ? 'Male' : 'Female'}) — the core anaemia signal.`
      : `At/above the ${hbCut} g/dL cutoff (${male ? 'Male' : 'Female'}).`);
  row('MCV', inp.MCV + ' fL',
    inp.MCV < 80 ? 'Low' : (inp.MCV > 100 ? 'High' : 'Normal'),
    inp.MCV < 80 || inp.MCV > 100 ? (inp.MCV < 80 ? 'st-low' : 'st-high') : 'st-ok',
    inp.MCV < 80 ? 'Microcytic — small red cells, classic iron-deficiency pattern.'
    : inp.MCV > 100 ? 'Macrocytic — large red cells, suggests B12 / folate pathway.'
    : 'Normocytic — normal cell size (80–100 fL).');
  row('MCH', inp.MCH + ' pg',
    inp.MCH < 27 ? 'Low' : (inp.MCH > 33 ? 'High' : 'Normal'),
    inp.MCH < 27 ? 'st-low' : (inp.MCH > 33 ? 'st-high' : 'st-ok'),
    inp.MCH < 27 ? 'Low haemoglobin per cell — hypochromia, aligns with iron deficiency.'
    : inp.MCH > 33 ? 'High haemoglobin per cell — seen in macrocytic states.' : 'Normal per-cell haemoglobin (27–33 pg).');
  row('MCHC', inp.MCHC + ' g/dL',
    inp.MCHC < 32 ? 'Low' : 'Normal', inp.MCHC < 32 ? 'st-low' : 'st-ok',
    inp.MCHC < 32 ? 'Low concentration — hypochromic cells, supports iron deficiency.'
    : 'Normal concentration (32–36 g/dL).');
  row('RDW', inp.RDW + ' %',
    inp.RDW > 14.5 ? 'High' : 'Normal', inp.RDW > 14.5 ? 'st-high' : 'st-ok',
    inp.RDW > 14.5 ? 'High variation in cell size (anisocytosis) — early deficiency flag.'
    : 'Uniform cell sizes (11.5–14.5%).');
  const rbcLo = male ? 4.5 : 4.0, rbcHi = male ? 5.9 : 5.2;
  row('RBC', inp.RBC + ' ×10¹²/L',
    inp.RBC < rbcLo ? 'Low' : (inp.RBC > rbcHi ? 'High' : 'Normal'),
    inp.RBC < rbcLo ? 'st-low' : (inp.RBC > rbcHi ? 'st-high' : 'st-ok'),
    inp.RBC < rbcLo ? `Below the ${rbcLo} reference — fewer oxygen-carrying cells.`
    : `Within reference (${rbcLo}–${rbcHi}).`);
  const hctCut = male ? 40 : 36;
  row('HCT', inp.HCT + ' %',
    inp.HCT < hctCut ? 'Low' : 'Normal', inp.HCT < hctCut ? 'st-low' : 'st-ok',
    inp.HCT < hctCut ? `Below ${hctCut}% — low packed-cell volume, mirrors low Hb.`
    : 'Normal packed-cell volume.');
  row('Ferritin', inp.Ferritin + ' ng/mL',
    inp.Ferritin < 30 ? 'Low' : (inp.Ferritin > 300 ? 'High' : 'Normal'),
    inp.Ferritin < 30 ? 'st-low' : (inp.Ferritin > 300 ? 'st-high' : 'st-ok'),
    inp.Ferritin < 30 ? 'Depleted iron stores — points to iron-deficiency anaemia.'
    : inp.Ferritin > 300 ? 'Elevated — suggests inflammation / overload, not iron lack.'
    : 'Adequate iron stores (30–300 ng/mL).');
  row('Age', inp.Age + ' y', 'Info', 'st-info',
    inp.Age < 12 ? 'Child — lower Hb cutoffs apply; interpret with paediatric ranges.'
    : inp.Age > 60 ? 'Senior — anaemia warrants workup for chronic / nutritional causes.'
    : 'Adult reference ranges apply.');
  return { rows, abnormal: rows.filter(d => d.c === 'st-low' || d.c === 'st-high') };
}
function summarize(r, inp, fa){
  const who = (r.name || inp.Name || '').trim();
  const abn = fa.abnormal.map(d => `${d.f} ${d.s.toUpperCase()}`).join(', ');
  const t = r.top_driver || { feature: 'Haemoglobin', value: 0 };
  return `${who ? `<b>${esc(who)}</b> — ` : ''}${inp.Age}-year-old ${inp.Gender}: `
    + `<b>${fa.abnormal.length} of 9 markers abnormal</b>${abn ? ` (${abn})` : ' — all values in range'}. `
    + `Top model driver: <b>${t.feature}</b>. Verdict: <b>${r.label}</b>, ${r.risk} risk (P=${Number(r.probability).toFixed(3)}).`;
}
function adviceText(bad){
  return bad
    ? 'Confirm with <b>CBC + ferritin / B12 / folate</b>, reticulocyte count.<br>Microcytic + low ferritin → iron studies; macrocytic → B12/folate.<br>Seek clinician review promptly — especially if High/Critical risk.'
    : 'Values look non-anaemic today. Re-screen annually or if fatigue, pallor or dizziness.<br>Maintain iron, B12 and folate intake.';
}

function renderResult(r){
  lastResult = r;
  lastInputs = {Gender: document.getElementById('in-Gender').value,
                Engine: document.getElementById('engine').value};
  FIELDS.forEach(f => { const s = document.getElementById('in-'+f.k); if(s) lastInputs[f.k] = Number(s.value); });
  document.getElementById('result-empty').hidden = true;
  const box = document.getElementById('result-box'); box.hidden = false;
  const bad = r.prediction === 1;
  document.getElementById('verdict').className = 'verdict';
  document.getElementById('verdict').innerHTML =
    `<span class="dot ${bad ? 'red' : 'green'}"></span>${bad ? 'Anaemia detected' : 'No Anaemia'} <small>(${(r.confidence*100).toFixed(1)}% confidence)</small><br><span class="risk">${r.risk.toUpperCase()} RISK • P=${r.probability.toFixed(3)}</span><br><small>Engine: ${r.engine_used}</small>`;
  // gauge needle: -90..+90 deg
  requestAnimationFrame(()=>{ document.getElementById('needle').style.transform = `rotate(${-90 + r.probability*180}deg)`; });
  document.getElementById('prob-num').textContent = r.probability.toFixed(3);
  const fill = document.getElementById('conf-fill');
  fill.style.width = '0%'; setTimeout(()=> fill.style.width = (r.confidence*100)+'%', 60);
  document.getElementById('conf-text').textContent = `Model output probability: ${r.probability.toFixed(3)} • confidence ${(r.confidence*100).toFixed(1)}%`;
  // patient + full feature-by-feature explanation
  const pname = (r.name || (lastInputs && lastInputs.Name) || '').trim();
  document.getElementById('patient-line').innerHTML = pname
    ? `<span>Patient</span> ${esc(pname)} <span>• ${lastInputs.Age}y • ${lastInputs.Gender} • ${r.engine_used}</span>`
    : `<span>${lastInputs.Age}y • ${lastInputs.Gender} • ${r.engine_used}</span>`;
  const fa = analyzeFeatures(lastInputs);
  document.querySelector('#feat-table tbody').innerHTML = fa.rows.map(d =>
    `<tr><td><b>${d.f}</b></td><td>${d.v}</td><td><span class="st ${d.c}">${d.s}</span></td><td>${d.n}</td></tr>`).join('');
  document.getElementById('explain-summary').innerHTML = summarize(r, lastInputs, fa);
  if(r.shap && r.shap.length){
    hbar(document.getElementById('shap-chart'), r.shap.map(d=>d.feature), r.shap.map(d=>d.value), `SHAP (base=${Number(r.base_value).toFixed(3)})`);
    const t = r.top_driver || r.shap[0];
    document.getElementById('top-driver').innerHTML = `Top driver: <b>${t.feature}</b> (SHAP ${Number(t.value)>=0?'+':''}${Number(t.value).toFixed(3)}) — ${Number(t.value)>0?'increases anaemia risk ➕':'protective ➖'}.`;
  }
  if(r.lime && r.lime.length){
    hbar(document.getElementById('lime-chart'), r.lime.map(d=>d.rule), r.lime.map(d=>d.weight), 'LIME local rules');
    document.getElementById('lime-list').innerHTML = r.lime.slice(-4).reverse().map(d=>`• <code>${d.rule}</code> → <b>${Number(d.weight)>=0?'+':''}${Number(d.weight).toFixed(3)}</b>`).join('<br>');
  } else { document.getElementById('lime-list').textContent = 'LIME unavailable for this engine.'; }
  document.getElementById('advice').innerHTML = bad
    ? 'Confirm with <b>CBC + ferritin / B12 / folate</b>, reticulocyte count.<br>Microcytic + low ferritin → iron studies; macrocytic → B12/folate.<br>Seek clinician review promptly — especially if High/Critical risk.'
    : 'Values look non-anaemic today. Re-screen annually or if fatigue, pallor or dizziness.<br>Maintain iron, B12 and folate intake.';
  box.scrollIntoView({behavior:'smooth', block:'nearest'});
}

// async submit (smooth, no reload); falls back to normal POST if fetch fails
document.getElementById('predict-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const load = document.getElementById('loading'); load.hidden = false;
  const payload = {engine: document.getElementById('engine').value, Gender: document.getElementById('in-Gender').value};
  payload.Name = document.getElementById('in-Name').value.trim();
  FIELDS.forEach(f => payload[f.k] = Number(document.getElementById('in-'+f.k).value));
  try {
    const res = await fetch('/api/predict', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    const data = await res.json();
    if(data.ok) renderResult(data); else alert('Prediction failed: ' + (data.error || 'unknown'));
  } catch(err){ e.target.submit(); return; }
  load.hidden = true;
});

// arena table + chart
(function(){
  const m = (window.HEMO && window.HEMO.metrics && window.HEMO.metrics.results) || {};
  const names = Object.keys(m);
  const tb = document.querySelector('#metrics-table tbody');
  let best = '', bestAcc = -1;
  names.forEach(n => { const r = m[n];
    if(r.accuracy > bestAcc){ bestAcc = r.accuracy; best = n; }
    tb.insertAdjacentHTML('beforeend', `<tr ${''}><td><b>${n}</b></td><td>${(r.accuracy*100).toFixed(2)}%</td><td>${(r.precision*100).toFixed(2)}%</td><td>${(r.recall*100).toFixed(2)}%</td><td>${(r.f1*100).toFixed(2)}%</td><td>${(r.roc_auc*100).toFixed(2)}%</td><td>${(r.cv_accuracy*100).toFixed(2)}%</td></tr>`);
  });
  const c = document.getElementById('arena-chart');
  const mono = ['#fafafa','#d4d4d8','#a1a1aa','#71717a','#52525b'];
  new Chart(c, {type:'bar', data:{labels:names, datasets:['accuracy','precision','recall','f1','roc_auc'].map((k,i)=>({label:k, data:names.map(n=>m[n][k]), backgroundColor:mono[i], borderRadius:6}))},
    options:{plugins:{legend:{position:'bottom', labels:{color:'#adb1b8'}}}, scales:{y:{min:0.9,max:1, grid:{color:'#18191b'}, ticks:{color:'#6b707a'}}, x:{grid:{display:false}, ticks:{color:'#adb1b8'}}}, animation:{duration:1000}}});
})();

// server-rendered fallback result (no-JS POST)
if (window.HEMO && window.HEMO.serverResult && !window.HEMO.serverResult.error) { renderResult(window.HEMO.serverResult); }

// ---------- scroll reveal ----------
(function(){
  const io = new IntersectionObserver(es => es.forEach(e => {
    if(e.isIntersecting){ e.target.classList.add('visible'); io.unobserve(e.target); }
  }), {threshold: 0.08});
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
})();

// ---------- toast ----------
function toast(msg, ms=4200){
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  requestAnimationFrame(()=> t.classList.add('show'));
  clearTimeout(t._h); t._h = setTimeout(()=>{ t.classList.remove('show'); }, ms);
}

// ---------- back to top ----------
(function(){
  const b = document.getElementById('to-top');
  addEventListener('scroll', ()=> b.classList.toggle('show', scrollY > 600), {passive:true});
  b.onclick = () => scrollTo({top:0, behavior:'smooth'});
})();

// ---------- report upload (PDF/DOCX -> auto-fill -> predict) ----------
(function(){
  const dz = document.getElementById('dropzone');
  const fi = document.getElementById('report-file');
  const status = document.getElementById('upload-status');
  const extBox = document.getElementById('extracted');
  if(!dz || !fi) return;
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fi.click(); } });
  ['dragover','dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { if(e.dataTransfer.files.length) upload(e.dataTransfer.files[0]); });
  fi.addEventListener('change', () => { if(fi.files.length) upload(fi.files[0]); });

  const UNITS = {Age:'', Gender:'', Name:'', Haemoglobin:'g/dL', MCV:'fL', MCH:'pg', MCHC:'g/dL', 'RDW':'%', RBC:'', HCT:'%', Ferritin:'ng/mL'};
  async function upload(file){
    if(!/\.pdf$/i.test(file.name) && !/\.docx$/i.test(file.name)){ showStatus('err', '❌ Only .pdf or .docx reports are supported.'); return; }
    if(file.size > 10*1024*1024){ showStatus('err', '❌ File too large (max 10 MB).'); return; }
    showStatus('busy', '<span class="spin"></span>Reading report & extracting lab values…');
    extBox.hidden = true;
    try{
      const fd = new FormData(); fd.append('report', file);
      const res = await fetch('/api/parse-report', {method:'POST', body: fd});
      const data = await res.json();
      if(!data.ok){ showStatus('err', '❌ ' + (data.error || 'Could not parse report.')); return; }
      const vals = data.values || {};
      let filled = 0;
      Object.entries(vals).forEach(([k, v]) => {
        const el = document.getElementById('in-' + k);
        if(el){ el.value = v; el.dispatchEvent(new Event('input'));
          const card = el.closest('.field'); if(card){ card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
          filled++; }
      });
      document.getElementById('ext-filename').textContent = '“' + (data.filename || file.name) + '”';
      document.getElementById('ext-chips').innerHTML = Object.entries(vals).map(([k,v]) =>
        `<span class="ext-chip"><b>${k}</b> = ${v}${UNITS[k] ? ' ' + UNITS[k] : ''}</span>`).join('');
      const ALL = ['Age','Gender','Haemoglobin','MCV','MCH','MCHC','RDW','RBC','HCT','Ferritin'];
      const missing = ALL.filter(k => !(k in vals));
      document.getElementById('ext-missing').textContent = missing.length ? `Not found in report (defaults kept): ${missing.join(', ')}.` : 'All 10 fields found! 🎉';
      extBox.hidden = false;
      showStatus('ok', `✅ Extracted ${filled} value(s) from ${file.name} — sliders updated, hit ⚡ Predict to continue.`);
      toast(`📄 ${filled} lab values extracted — press Predict to continue`);
      document.getElementById('predict').scrollIntoView({behavior:'smooth'});
    }catch(err){ showStatus('err', '❌ Upload failed: ' + err.message); }
  }
  function showStatus(kind, html){
    status.hidden = false;
    status.className = 'upload-status ' + kind;
    status.innerHTML = html;
  }
})();

// ---------- downloadable prediction report ----------
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function buildReportHTML(r, inputs){
  const dt = new Date().toLocaleString();
  const bad = r.prediction === 1;
  const who = (r.name || (inputs && inputs.Name) || '').trim();
  const fa = analyzeFeatures(inputs || {});
  const vrows = Object.entries(inputs || {}).filter(([k]) => k !== 'Name' && k !== 'Engine')
    .map(([k,v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  const frows = fa.rows.map(d => `<tr><td>${esc(d.f)}</td><td>${esc(d.v)}</td><td>${esc(d.s)}</td><td>${esc(d.n)}</td></tr>`).join('');
  const shap = (r.shap||[]).map(d => `<tr><td>${esc(d.feature)}</td><td>${Number(d.value)>=0?'+':''}${Number(d.value).toFixed(4)}</td><td>${Number(d.value)>0?'pushes toward Anaemia':'protective'}</td></tr>`).join('');
  const lime = (r.lime||[]).map(d => `<tr><td>${esc(d.rule)}</td><td>${Number(d.weight)>=0?'+':''}${Number(d.weight).toFixed(4)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>HemoSense Report${who ? ' - ' + esc(who) : ''}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;background:#fff;color:#111;max-width:780px;margin:32px auto;padding:0 20px}
h1{font-size:26px;margin:0}h2{font-size:17px;margin:28px 0 8px;border-bottom:2px solid #111;padding-bottom:4px}
.sub{color:#555}.verdict{font-size:20px;font-weight:bold;padding:14px 18px;border:2px solid #111;border-radius:10px;margin:16px 0}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #ddd;vertical-align:top}
th{background:#111;color:#fff}.foot{margin-top:26px;font-size:12px;color:#666}.sum{background:#f4f4f4;border-radius:8px;padding:12px 16px}</style></head><body>
<h1>🩸 HemoSense — Anaemia Screening Report</h1>
<p class="sub">Patient: <b>${esc(who || '—')}</b> • Generated ${esc(dt)} • Engine: ${esc(r.engine_used||'')}</p>
<div class="verdict">${bad ? '🔴 ANAEMIA DETECTED' : '🟢 NO ANAEMIA'} — ${esc(r.risk||'')} risk (P=${Number(r.probability).toFixed(3)}, confidence ${(Number(r.confidence)*100).toFixed(1)}%)</div>
<h2>Summary explanation</h2><p class="sum">${summarize(r, inputs || {}, fa)}</p>
<h2>Patient values</h2><table><tr><th>Feature</th><th>Value</th></tr>${vrows}</table>
<h2>Feature-by-feature explanation</h2><table><tr><th>Feature</th><th>Value</th><th>Status</th><th>What it means</th></tr>${frows}</table>
<h2>SHAP — top drivers</h2><table><tr><th>Feature</th><th>SHAP</th><th>Effect</th></tr>${shap || '<tr><td colspan=3>n/a</td></tr>'}</table>
<h2>LIME — local rules</h2><table><tr><th>Rule</th><th>Weight</th></tr>${lime || '<tr><td colspan=2>n/a</td></tr>'}</table>
<h2>Recommended next steps</h2><p>${adviceText(bad)}</p>
<p class="foot">Screening aid only — not a diagnosis. Confirm with laboratory tests and a clinician.</p>
</body></html>`;
}
document.getElementById('btn-download').addEventListener('click', () => {
  if(!lastResult){ toast('Run a prediction first.'); return; }
  const blob = new Blob([buildReportHTML(lastResult, lastInputs)], {type:'text/html'});
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  const who = String((lastResult && lastResult.name) || (lastInputs && lastInputs.Name) || '')
    .trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  a.href = URL.createObjectURL(blob);
  a.download = `HemoSense-Report${who ? '-' + who : ''}-${stamp}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Report downloaded — open it in any browser, or print it to PDF.');
});
document.getElementById('btn-print').addEventListener('click', () => window.print());
