// app.js - dashboard logic: calls the Node API, draws the map, results and charts.
const STATUS_COLORS = { LOW: '#2e9e5b', MODERATE: '#d9a400', HIGH: '#e8741a', CRITICAL: '#d1242f' };
const SVG_NS = 'http://www.w3.org/2000/svg';

const state = {
  network: null,        // stations (geometry + lines), lines, edges
  live: {},             // station id -> { load, loadPct, status }
  lineColor: {},        // line name -> colour
  source: null,
  dest: null,
  route: null,          // currently drawn recommended route (array of station ids)
  loadChart: null,
  simChart: null,
};

const $ = (id) => document.getElementById(id);

// ---------- tiny DOM helpers (textContent only => no HTML injection) ----------
function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else n.setAttribute(k, v);
  }
  kids.flat().forEach((c) => { if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return n;
}
function svg(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// ---------- API ----------
async function api(path, options) {
  const res = await fetch('/api' + path, options);
  let data;
  try { data = await res.json(); } catch (e) { data = { error: 'Server sent an invalid response' }; }
  if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
  return data;
}
const post = (path, body) => api(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
});

function showError(message) {
  const box = $('errorBox');
  box.textContent = message;
  box.hidden = !message;
}

async function busy(button, task) {
  button.disabled = true;
  showError('');
  try { await task(); } catch (e) { showError(e.message); } finally { button.disabled = false; }
}

// ---------- live state (crowd levels) ----------
function applyState(s) {
  state.live = {};
  s.stations.forEach((st) => { state.live[st.id] = st; });

  const sum = s.summary;
  $('sumPeak').textContent = sum.peakLoadPct + '%';
  $('sumAvg').textContent = sum.averageLoadPct + '%';
  $('sumCrit').textContent = sum.criticalStations;
  $('sumTick').textContent = s.tick;

  const list = $('alerts');
  list.replaceChildren();
  if (s.alerts.length === 0) list.append(el('li', { class: 'none' }, 'All stations are below 75% capacity.'));
  s.alerts.forEach((a) => list.append(el('li', { class: a.startsWith('CRITICAL') ? 'CRITICAL' : 'HIGH' }, a)));

  drawMap();
  drawLoadChart();
}

// ---------- metro map (SVG) ----------
function drawMap() {
  const map = $('map');
  map.replaceChildren();
  const net = state.network;
  const pos = {};
  net.stations.forEach((s) => { pos[s.id] = s; });

  // 1. metro lines
  net.lines.forEach((l) => {
    const pts = l.stations.map((id) => pos[id].x + ',' + pos[id].y).join(' ');
    map.append(svg('polyline', { points: pts, fill: 'none', stroke: l.color, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.85 }));
  });

  // 2. highlighted recommended route
  if (state.route && state.route.length > 1) {
    const pts = state.route.map((id) => pos[id].x + ',' + pos[id].y).join(' ');
    map.append(svg('polyline', { points: pts, fill: 'none', stroke: '#111', 'stroke-width': 14, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.22 }));
  }
  const onRoute = new Set(state.route || []);

  // 3. stations (coloured by crowd level)
  net.stations.forEach((s) => {
    const live = state.live[s.id] || { status: 'LOW' };
    const isEnd = s.id === state.source || s.id === state.dest;
    const g = svg('g', { class: 'station' });
    const circle = svg('circle', {
      cx: s.x, cy: s.y, r: s.interchange ? 10 : 7,
      fill: STATUS_COLORS[live.status] || '#999',
      stroke: isEnd ? (s.id === state.source ? '#0b6bcb' : '#7a2fd0') : (onRoute.has(s.id) ? '#111' : '#fff'),
      'stroke-width': isEnd ? 4 : 3,
    });
    const tip = svg('title');
    tip.textContent = s.name + ' – ' + (live.loadPct ?? 0) + '% (' + live.status + ')';
    g.append(circle, tip);
    g.addEventListener('click', () => pickStation(s.id));
    map.append(g);
  });

  // 4. labels
  net.stations.forEach((s) => {
    const t = svg('text', { x: s.x + 12, y: s.y - 9 });
    t.textContent = s.name;
    map.append(t);
  });
}

function pickStation(id) {
  // first click -> source, next click -> destination, then start over
  if (!state.source || (state.source && state.dest)) { state.source = id; state.dest = null; }
  else if (id !== state.source) { state.dest = id; }
  $('sourceSel').value = state.source || '';
  $('destSel').value = state.dest || '';
  state.route = null;
  drawMap();
}

// ---------- route result ----------
function metricRow(label, rec, fast, key, unit, lowerIsBetter) {
  const a = rec[key], b = fast[key];
  const recBest = lowerIsBetter && a < b, fastBest = lowerIsBetter && b < a;
  return el('tr', {}, el('th', {}, label),
    el('td', { class: recBest ? 'best' : '' }, a + unit),
    el('td', { class: fastBest ? 'best' : '' }, b + unit));
}

function renderResult(d) {
  const box = $('result');
  box.className = '';
  box.replaceChildren();

  const rec = d.recommended, fast = d.fastest;
  box.append(el('div', {}, el('b', {}, d.source + ' → ' + d.destination), ' · ' + d.passengers + ' passengers'));

  if (d.sameRoute) {
    box.append(el('div', { class: 'banner', style: 'margin-top:10px' }, 'The fastest route is also the least crowded option right now.'));
  } else {
    const extra = Math.round(d.timeDifference);
    box.append(el('div', { class: 'banner detour', style: 'margin-top:10px' },
      'A less crowded route exists: ' + (extra >= 0 ? '+' + extra : extra) + ' min travel time, ' +
      d.crowdReductionPct + '% lower average crowd than the fastest route.'));
  }

  const table = el('table', { class: 'compare' },
    el('tr', {}, el('th', {}), el('th', {}, 'Recommended'), el('th', {}, 'Fastest')),
    metricRow('Travel time', rec, fast, 'travelTime', ' min', true),
    metricRow('Distance', rec, fast, 'distanceKm', ' km', true),
    metricRow('Transfers', rec, fast, 'transfers', '', true),
    metricRow('Avg crowd', rec, fast, 'avgCrowdPct', '%', true),
    metricRow('Peak crowd', rec, fast, 'maxCrowdPct', '%', true),
    el('tr', {}, el('th', {}, 'Crowd status'),
      el('td', {}, el('span', { class: 'chip', style: 'background:' + STATUS_COLORS[rec.crowdStatus] }, rec.crowdStatus)),
      el('td', {}, el('span', { class: 'chip', style: 'background:' + STATUS_COLORS[fast.crowdStatus] }, fast.crowdStatus))));
  box.append(table);

  const steps = el('ol', { class: 'steps' });
  rec.stations.forEach((st, i) => {
    const lineName = rec.segmentLines[i] || rec.segmentLines[i - 1];
    steps.append(el('li', {},
      el('span', { class: 'dot', style: 'border-color:' + (state.lineColor[lineName] || '#888') }),
      el('span', { class: 'name' }, st.name),
      el('span', { class: 'pct' }, st.loadPct + '%'),
      el('span', { class: 'chip', style: 'background:' + STATUS_COLORS[st.status] }, st.status)));
  });
  box.append(steps);

  if (d.committed) box.append(el('p', { class: 'hint' }, d.passengers + ' passengers were added to the stations on this route; the map and charts show the updated load.'));
  d.warnings.forEach((w) => box.append(el('div', { class: 'banner detour', style: 'margin-top:8px' }, w)));
}

// ---------- charts ----------
function chartsAvailable() { return typeof window.Chart !== 'undefined'; }

function drawLoadChart() {
  const canvas = $('loadChart');
  if (!chartsAvailable()) { canvas.replaceWith(el('p', { class: 'empty', id: 'loadChart' }, 'Chart.js could not be loaded (run npm install, or connect to the internet once).')); return; }
  const rows = Object.values(state.live).sort((a, b) => b.loadPct - a.loadPct).slice(0, 12);
  const data = {
    labels: rows.map((r) => r.name),
    datasets: [{ label: 'Load (% of capacity)', data: rows.map((r) => r.loadPct), backgroundColor: rows.map((r) => STATUS_COLORS[r.status]) }],
  };
  if (state.loadChart) { state.loadChart.data = data; state.loadChart.update(); return; }
  state.loadChart = new Chart(canvas, {
    type: 'bar', data,
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, suggestedMax: 100, title: { display: true, text: '% of capacity' } }, x: { ticks: { maxRotation: 60 } } } },
  });
}

function renderSimulation(d) {
  const f = d.fastest, c = d.crowdAware, imp = d.improvement;
  const box = $('simSummary');
  box.replaceChildren(
    el('div', {}, el('b', {}, d.groups + ' passenger groups'), ' (' + f.passengers + ' passengers) simulated twice from the current crowd state.'),
    el('div', {}, 'Passengers sent through critical stations: ', el('b', {}, f.exposedPassengers + ' → ' + c.exposedPassengers),
      ' (' + imp.exposureReductionPct + '% fewer).'),
    el('div', {}, 'Peak load: ', el('b', {}, f.peakLoadPct + '% → ' + c.peakLoadPct + '%'),
      ' · Average trip: ', el('b', {}, (imp.extraTravelMinutes >= 0 ? '+' : '') + imp.extraTravelMinutes + ' min')));

  if (!chartsAvailable()) return;
  const labels = f.timeline.map((_, i) => 'Step ' + (i + 1));
  const data = {
    labels,
    datasets: [
      { label: 'Fastest only', data: f.timeline, borderColor: '#d1242f', backgroundColor: '#d1242f', tension: 0.25, pointRadius: 0 },
      { label: 'Crowd-aware', data: c.timeline, borderColor: '#2e9e5b', backgroundColor: '#2e9e5b', tension: 0.25, pointRadius: 0 },
    ],
  };
  if (state.simChart) state.simChart.destroy();
  state.simChart = new Chart($('simChart'), {
    type: 'line', data,
    options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: 'Peak station load (%)' } }, x: { ticks: { maxTicksLimit: 10 } } } },
  });
}

// ---------- start-up + buttons ----------
function fillSelect(select) {
  const sorted = [...state.network.stations].sort((a, b) => a.name.localeCompare(b.name));
  select.replaceChildren(el('option', { value: '' }, 'Select station…'), ...sorted.map((s) => el('option', { value: s.id }, s.name)));
}

async function init() {
  try {
    state.network = await api('/network');
    state.network.lines.forEach((l) => { state.lineColor[l.name] = l.color; });
    fillSelect($('sourceSel'));
    fillSelect($('destSel'));
    $('sourceSel').value = 'RJG';
    $('destSel').value = 'ANV';
    state.source = 'RJG';
    state.dest = 'ANV';
    applyState(state.network.state);
  } catch (e) {
    showError('Could not load the metro network: ' + e.message);
  }
}

$('sourceSel').addEventListener('change', (e) => { state.source = e.target.value || null; state.route = null; drawMap(); });
$('destSel').addEventListener('change', (e) => { state.dest = e.target.value || null; state.route = null; drawMap(); });

$('findBtn').addEventListener('click', () => busy($('findBtn'), async () => {
  if (!state.source || !state.dest) throw new Error('Please choose both a source and a destination station.');
  const d = await post('/route', {
    source: state.source, destination: state.dest,
    passengers: Number($('passengers').value), commit: $('commit').checked,
  });
  state.route = d.recommended.stations.map((s) => s.id);
  renderResult(d);
  applyState(d.state);
}));

$('tickBtn').addEventListener('click', () => busy($('tickBtn'), async () => applyState((await post('/tick')).state)));
$('resetBtn').addEventListener('click', () => busy($('resetBtn'), async () => { state.route = null; applyState((await post('/reset')).state); }));
$('simBtn').addEventListener('click', () => busy($('simBtn'), async () => {
  renderSimulation(await post('/simulate', { groups: Number($('simGroups').value) }));
}));

init();
