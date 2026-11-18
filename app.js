import {
  login, logout, getUser, handleAuthCallback, acceptInvite, updateUser, requestPasswordRecovery
} from '@netlify/identity';

var $ = function (i) { return document.getElementById(i); };
var cfg = { lsps: [], mps: [] }, rows = [], delRows = [], me = null, isAdmin = false, todayStr = '';
var pollTimer = null, started = false;

function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
function beep(ok) { try { var a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(); o.frequency.value = ok ? 880 : 220; o.connect(a.destination); o.start(); setTimeout(function () { o.stop(); }, ok ? 120 : 350); } catch (e) {} }
function show(t, c) { var m = $('msg'); m.className = c; m.textContent = t; m.style.display = 'block'; try { m.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
function note(t, c) { var n = $('anote'); n.textContent = t; n.style.color = c === 'er' ? 'var(--er)' : c === 'wr' ? 'var(--wr)' : 'var(--ok)'; }
function view(name) { ['auth', 'setpw', 'app'].forEach(function (id) { $(id).classList.toggle('hide', id !== name); }); }
function dayIST(ts) { return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); }
function fill(id, arr) { var s = $(id), v = s.value; s.innerHTML = arr.length ? arr.map(function (x) { return '<option>' + esc(x) + '</option>'; }).join('') : "<option value=''>Add one below</option>"; if (arr.indexOf(v) > -1) s.value = v; }

function showLogin(msg) {
  stopPolling(); started = false; me = null;
  view('auth'); $('amsg').style.color = 'var(--er)'; $('amsg').textContent = msg || '';
}

async function api(path, opts) {
  var o = Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts || {});
  var r = await fetch('/api' + path, o);
  if (r.status === 401) { showLogin('Please sign in again.'); var e1 = new Error('Not signed in'); e1.status = 401; throw e1; }
  var j = await r.json().catch(function () { return {}; });
  if (!r.ok) { var e = new Error(j.error || ('Error ' + r.status)); e.status = r.status; e.data = j; throw e; }
  return j;
}

/* ---------- login ---------- */
$('lg').onclick = async function () {
  var em = $('em').value.trim(), pw = $('pw').value;
  if (!em || !pw) { $('amsg').style.color = 'var(--er)'; $('amsg').textContent = 'Enter email and password'; return; }
  $('amsg').style.color = 'var(--mu)'; $('amsg').textContent = 'Signing in...';
  try { await login(em, pw); $('pw').value = ''; await startApp(); }
  catch (e) { $('amsg').style.color = 'var(--er)'; $('amsg').textContent = (e && e.message) || 'Sign in failed'; }
};
$('pw').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('lg').click(); });
$('fg').onclick = async function () {
  var em = $('em').value.trim();
  if (!em) { $('amsg').style.color = 'var(--er)'; $('amsg').textContent = 'Type your email above first'; return; }
  try { await requestPasswordRecovery(em); $('amsg').style.color = 'var(--ok)'; $('amsg').textContent = 'If the email exists, a reset link was sent.'; }
  catch (e) { $('amsg').style.color = 'var(--er)'; $('amsg').textContent = (e && e.message) || 'Could not send reset email'; }
};
$('lo').onclick = async function () { try { await logout(); } catch (e) {} showLogin(''); };

var pendingInvite = null, pendingMode = '';
function showSetPw(mode, token) {
  pendingMode = mode; pendingInvite = token || null;
  $('spt').textContent = mode === 'invite' ? 'Welcome. Choose a password' : 'Choose a new password';
  $('smsg').textContent = ''; view('setpw');
}
$('sp').onclick = async function () {
  var p = $('np').value;
  if (p.length < 8) { $('smsg').style.color = 'var(--er)'; $('smsg').textContent = 'Use at least 8 characters'; return; }
  try {
    if (pendingMode === 'invite') await acceptInvite(pendingInvite, p);
    else await updateUser({ password: p });
    $('np').value = ''; history.replaceState(null, '', location.pathname);
    await startApp();
  } catch (e) { $('smsg').style.color = 'var(--er)'; $('smsg').textContent = (e && e.message) || 'Could not save password'; }
};

/* ---------- lists ---------- */
function saveCfg() {
  return api('/config', { method: 'PUT', body: JSON.stringify(cfg) }).then(function (r) { cfg = r; return true; })
    .catch(function (e) { note('Could not save list: ' + e.message, 'er'); return false; });
}
function addItem(key, inp, sel) {
  var items = $(inp).value.split(/[\n,;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  if (!items.length) { note('Type a name first', 'wr'); return; }
  var added = [], dup = 0;
  items.forEach(function (v) { if (cfg[key].indexOf(v) > -1 || added.indexOf(v) > -1) dup++; else added.push(v); });
  if (!added.length) { note('Already in the list', 'wr'); return; }
  cfg[key] = cfg[key].concat(added); $(inp).value = ''; fill(sel, cfg[key]); note('Saving...', 'wr');
  saveCfg().then(function (ok) { fill(sel, cfg[key]); if (ok) note('Added ' + added.length + (dup ? ' (' + dup + ' already existed)' : ''), 'ok'); });
}
$('al').onclick = function () { addItem('lsps', 'newlsp', 'lsp'); };
$('am').onclick = function () { addItem('mps', 'newmp', 'mp'); };
var armed = {};
function removeItem(key, sel, btn) {
  var v = $(sel).value, lab = btn === 'rl' ? 'Remove selected LSP' : 'Remove selected marketplace';
  if (!v) { note('Nothing selected', 'wr'); return; }
  var b = $(btn);
  if (armed[btn] !== v) { armed[btn] = v; b.textContent = 'Click again to remove ' + v; setTimeout(function () { armed[btn] = null; b.textContent = lab; }, 4000); return; }
  armed[btn] = null; b.textContent = lab;
  cfg[key] = cfg[key].filter(function (x) { return x !== v; }); fill(sel, cfg[key]); note('Removing...', 'wr');
  saveCfg().then(function (ok) { fill(sel, cfg[key]); if (ok) note('Removed ' + v, 'ok'); });
}
$('rl').onclick = function () { removeItem('lsps', 'lsp', 'rl'); };
$('rmk').onclick = function () { removeItem('mps', 'mp', 'rmk'); };
$('st').onchange = function () { $('rmw').classList.toggle('hide', $('st').value !== 'Rejected'); };

/* ---------- scanning ---------- */
var busy = false;
async function scan(code) {
  var awb = code.trim().replace(/[\/\s]+/g, '');
  if (!awb || busy) return;
  if (!$('lsp').value || !$('mp').value) { show('Select LSP and marketplace first', 'wr'); beep(0); return; }
  busy = true;
  try {
    var r = await api('/scan', { method: 'POST', body: JSON.stringify({ awb: awb, lsp: $('lsp').value, mp: $('mp').value, status: $('st').value, remark: $('rm').value }) });
    show('Saved: ' + awb + ' (' + r.record.status + ')', 'ok'); beep(1);
    await loadScans();
  } catch (e) {
    if (e.status === 409) {
      var d = (e.data && e.data.existing) || {};
      show('Already scanned: ' + awb + (d.status ? ' (' + d.status : '') + (d.ts ? ' on ' + new Date(d.ts).toLocaleString() : '') + (d.status ? ')' : ''), 'er');
    } else if (e.status !== 401) show('Save failed: ' + e.message, 'er');
    beep(0);
  }
  busy = false;
}
$('awb').addEventListener('keydown', function (e) { if (e.key !== 'Enter') return; var v = $('awb').value; $('awb').value = ''; scan(v).then(function () { $('awb').focus(); }); });

var stream = null, timer = null, last = '', lastT = 0;
$('cam').onclick = async function () {
  var v = $('v');
  if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; clearInterval(timer); v.style.display = 'none'; $('cam').textContent = 'Use phone camera'; return; }
  if (!('BarcodeDetector' in window)) { show('Camera scanning is not supported in this browser. Use a barcode scanner or type the AWB.', 'wr'); return; }
  try {
    var det = new BarcodeDetector();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    v.srcObject = stream; v.style.display = 'block'; await v.play(); $('cam').textContent = 'Stop camera';
    timer = setInterval(async function () { try { var r = await det.detect(v); if (r.length) { var c = r[0].rawValue; if (c !== last || Date.now() - lastT > 4000) { last = c; lastT = Date.now(); scan(c); } } } catch (e) {} }, 400);
  } catch (e) { show('Camera blocked or unavailable. Allow camera access, or use a scanner.', 'wr'); }
};

/* ---------- data + render ---------- */
function dateMinus(dateStr, n) { var d = new Date(dateStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }
async function loadScans() {
  var t = dayIST(Date.now());
  var r = await api('/scans?dates=' + t + ',' + dateMinus(t, 1));
  rows = r.rows; todayStr = r.today; render();
}
async function loadDeleted() { if (!isAdmin) return; try { var r = await api('/deleted'); delRows = r.rows; render(); } catch (e) {} }
function render() {
  var t = rows.filter(function (r) { return dayIST(r.ts) === todayStr; });
  var nr = t.filter(function (r) { return r.status === 'Received'; }).length;
  $('nr').textContent = nr; $('nj').textContent = t.length - nr;
  function grp(key) {
    var g = {}; t.forEach(function (r) { var k = key(r); g[k] = (g[k] || 0) + 1; });
    return Object.keys(g).sort(function (a, b) { return g[b] - g[a]; }).map(function (k, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(k) + '</td><td>' + g[k] + '</td></tr>'; }).join('') || '<tr><td>No scans today</td></tr>';
  }
  var h = '<tr><th>#</th><th>Name</th><th>Count</th></tr>';
  $('tm').innerHTML = h + grp(function (r) { return r.mp; });
  $('ts').innerHTML = h + grp(function (r) { return r.byName || 'User'; });
  $('tl').innerHTML = h + grp(function (r) { return r.lsp; });
  var rj = t.filter(function (r) { return r.status === 'Rejected'; });
  $('tj2').innerHTML = '<tr><th>Time</th><th>AWB</th><th>Marketplace</th><th>Remark</th></tr>' + (rj.map(function (r) { return '<tr><td>' + new Date(r.ts).toLocaleTimeString() + '</td><td>' + esc(r.awb) + '</td><td>' + esc(r.mp) + '</td><td>' + esc(r.remark) + '</td></tr>'; }).join('') || '<tr><td>No rejected scans today</td></tr>');
  $('td').innerHTML = '<tr><th>Deleted at</th><th>Deleted by</th><th>AWB</th><th>LSP</th><th>Marketplace</th><th>Status</th><th>Scanned by</th><th>Scanned at</th></tr>' + (delRows.map(function (r) { return '<tr><td>' + new Date(r.delTs).toLocaleString() + '</td><td>' + esc(r.delByName || 'User') + '</td><td>' + esc(r.awb) + '</td><td>' + esc(r.lsp) + '</td><td>' + esc(r.mp) + '</td><td>' + esc(r.status) + '</td><td>' + esc(r.byName || 'User') + '</td><td>' + (r.ts ? new Date(r.ts).toLocaleString() : '') + '</td></tr>'; }).join('') || '<tr><td>Nothing deleted yet</td></tr>');
  $('tr').innerHTML = '<tr><th>Time</th><th>AWB</th><th>LSP</th><th>Marketplace</th><th>Status</th><th>By</th><th></th></tr>' + rows.slice(0, 20).map(function (r) { return '<tr><td>' + new Date(r.ts).toLocaleTimeString() + '</td><td>' + esc(r.awb) + '</td><td>' + esc(r.lsp) + '</td><td>' + esc(r.mp) + '</td><td>' + esc(r.status) + '</td><td>' + esc(r.byName || 'User') + '</td>' + (isAdmin ? "<td><button class='g' data-a='" + esc(r.awb) + "'>Delete</button></td>" : '<td></td>') + '</tr>'; }).join('');
  $('cap').textContent = 'Showing the latest 20 of ' + rows.length + ' scans from today and yesterday.';
}
var delArmed = null;
$('tr').onclick = function (e) {
  var a = e.target.getAttribute && e.target.getAttribute('data-a'); if (!a || !isAdmin) return;
  if (delArmed !== a) { delArmed = a; e.target.textContent = 'Sure?'; setTimeout(function () { if (delArmed === a) { delArmed = null; render(); } }, 4000); return; }
  delArmed = null;
  api('/scan/' + encodeURIComponent(a), { method: 'DELETE' })
    .then(function () { show('Deleted ' + a + ' (saved in deleted history)', 'ok'); return Promise.all([loadScans(), loadDeleted()]); })
    .catch(function (err) { if (err.status !== 401) show('Delete failed: ' + err.message, 'er'); });
};
function csvCell(v) { var s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }
$('dl').onclick = async function () {
  var d = $('csvd').value || dayIST(Date.now());
  try {
    var r = await api('/scans?dates=' + d);
    var csv = ['AWB,LSP,Marketplace,Status,Remark,Scanned By,Date Time'].concat(r.rows.map(function (x) {
      return [x.awb, x.lsp, x.mp, x.status, x.remark, x.byName, new Date(x.ts).toLocaleString()].map(csvCell).join(',');
    })).join('\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    a.download = 'inward-scans-' + d + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { if (e.status !== 401) show('Download failed: ' + e.message, 'er'); }
};

/* ---------- start ---------- */
function stopPolling() { clearInterval(pollTimer); pollTimer = null; }
async function startApp() {
  try { me = await api('/me'); } catch (e) { if (e.status !== 401) showLogin('Could not load your account: ' + e.message); return; }
  isAdmin = !!me.isAdmin; view('app');
  $('who').textContent = 'Signed in as ' + me.name + ' (' + (isAdmin ? 'Admin' : 'Scanner') + ')';
  $('adm1').classList.toggle('hide', !isAdmin); $('delcard').classList.toggle('hide', !isAdmin);
  $('csvd').value = dayIST(Date.now());
  try { cfg = await api('/config'); fill('lsp', cfg.lsps); fill('mp', cfg.mps); } catch (e) {}
  await loadScans().catch(function () {}); await loadDeleted();
  if (!started) { started = true; $('awb').focus(); }
  stopPolling();
  pollTimer = setInterval(function () { if (!document.hidden && !$('app').classList.contains('hide')) { loadScans().catch(function () {}); } }, 10000);
}
async function boot() {
  var cb = null;
  try { cb = await handleAuthCallback(); } catch (e) { showLogin((e && e.message) || 'That link did not work. Ask your admin to send a new one.'); return; }
  if (cb && cb.type === 'invite' && cb.token) { showSetPw('invite', cb.token); return; }
  if (cb && cb.type === 'recovery') { showSetPw('recovery'); return; }
  var u = null; try { u = await getUser(); } catch (e) {}
  if (u) startApp(); else showLogin('');
}
boot();
