import { getUser } from '@netlify/identity';
import { getStore } from '@netlify/blobs';

export const config = { path: '/api/*' };

const TZ = 'Asia/Kolkata';
const dayOf = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status, error, extra = {}) => json({ error, ...extra }, status);

const store = (name) => getStore({ name, consistency: 'strong' });

async function readMany(st, keys) {
  const out = [];
  for (let i = 0; i < keys.length; i += 25) {
    const part = await Promise.all(keys.slice(i, i + 25).map((k) => st.get(k, { type: 'json' })));
    part.forEach((v) => v && out.push(v));
  }
  return out;
}

function cleanList(arr) {
  if (!Array.isArray(arr)) return null;
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const v = String(x == null ? '' : x).trim().slice(0, 80);
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out.slice(0, 500);
}

export default async (req) => {
  let user = null;
  try { user = await getUser(); } catch (e) { user = null; }
  if (!user) return fail(401, 'Not signed in');

  const isAdmin = Array.isArray(user.roles) && user.roles.includes('admin');
  const who = user.name || user.email || 'User';
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/\/+$/, '') || '/';
  const method = req.method;

  try {
    if (path === '/me' && method === 'GET') {
      return json({ id: user.id, name: who, email: user.email || '', isAdmin });
    }

    if (path === '/config' && method === 'GET') {
      const cfg = (await store('config').get('lists', { type: 'json' })) || {};
      return json({ lsps: cfg.lsps || [], mps: cfg.mps || [] });
    }

    if (path === '/config' && method === 'PUT') {
      if (!isAdmin) return fail(403, 'Admin only');
      const body = await req.json().catch(() => ({}));
      const lsps = cleanList(body.lsps);
      const mps = cleanList(body.mps);
      if (!lsps || !mps) return fail(400, 'Bad lists');
      await store('config').setJSON('lists', { lsps, mps });
      return json({ lsps, mps });
    }

    if (path === '/scan' && method === 'POST') {
      const b = await req.json().catch(() => ({}));
      const awb = String(b.awb || '').replace(/[\/\s]+/g, '');
      if (!awb || awb.length > 100) return fail(400, 'Invalid AWB');
      const lsp = String(b.lsp || '').trim().slice(0, 80);
      const mp = String(b.mp || '').trim().slice(0, 80);
      const status = b.status === 'Rejected' ? 'Rejected' : 'Received';
      if (!lsp || !mp) return fail(400, 'Select LSP and marketplace');
      const remark = status === 'Rejected' ? String(b.remark || '').trim().slice(0, 300) : '';

      const ts = Date.now();
      const date = dayOf(ts);
      const key = encodeURIComponent(awb);

      // Claim the AWB first. onlyIfNew stops the same AWB being saved twice.
      const claim = await store('awbs').setJSON(key, { awb, date, ts }, { onlyIfNew: true });
      if (!claim || claim.modified === false) {
        const prev = await store('awbs').get(key, { type: 'json' });
        let rec = null;
        if (prev && prev.date) rec = await store('scans').get(`${prev.date}/${key}`, { type: 'json' });
        return fail(409, 'Already scanned', { awb, existing: rec || prev || null });
      }

      const rec = { awb, lsp, mp, status, remark, by: user.id, byName: who, ts };
      await store('scans').setJSON(`${date}/${key}`, rec);
      return json({ ok: true, record: rec });
    }

    if (path === '/scans' && method === 'GET') {
      const dates = (url.searchParams.get('dates') || dayOf(Date.now()))
        .split(',').map((s) => s.trim()).filter((s) => DATE_RE.test(s)).slice(0, 7);
      const st = store('scans');
      let rows = [];
      for (const d of dates) {
        const { blobs } = await st.list({ prefix: `${d}/` });
        rows = rows.concat(await readMany(st, blobs.map((x) => x.key)));
      }
      rows.sort((a, b) => b.ts - a.ts);
      return json({ rows, today: dayOf(Date.now()) });
    }

    if (path.startsWith('/scan/') && method === 'DELETE') {
      if (!isAdmin) return fail(403, 'Admin only');
      const awb = decodeURIComponent(path.slice('/scan/'.length));
      const key = encodeURIComponent(awb);
      const idx = await store('awbs').get(key, { type: 'json' });
      if (!idx) return fail(404, 'Scan not found');
      const sk = `${idx.date}/${key}`;
      const rec = (await store('scans').get(sk, { type: 'json' })) || { awb, ts: idx.ts };
      const delTs = Date.now();
      await store('deleted').setJSON(`${delTs}-${key}`, { ...rec, delBy: user.id, delByName: who, delTs });
      await store('scans').delete(sk);
      await store('awbs').delete(key);
      return json({ ok: true });
    }

    if (path === '/deleted' && method === 'GET') {
      if (!isAdmin) return fail(403, 'Admin only');
      const st = store('deleted');
      const { blobs } = await st.list();
      const keys = blobs.map((x) => x.key).sort().reverse().slice(0, 200);
      const rows = await readMany(st, keys);
      rows.sort((a, b) => b.delTs - a.delTs);
      return json({ rows });
    }

    return fail(404, 'Not found');
  } catch (e) {
    console.error('api error', path, method, e && e.message);
    return fail(500, 'Server error');
  }
};
