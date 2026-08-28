const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'cbti-admin-2026';

// ---------- 数据存储：JSON Lines 文件，零依赖 ----------
const DB_FILE = path.join(__dirname, 'cbti_events.jsonl');
let events = [];
try {
  if (fs.existsSync(DB_FILE)) {
    const lines = fs.readFileSync(DB_FILE, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) { try { events.push(JSON.parse(line)); } catch (e) {} }
  }
} catch (e) { console.error('load db failed:', e.message); }

let writeQueue = Promise.resolve();
function saveEvent(ev) {
  events.push(ev);
  const line = JSON.stringify(ev) + '\n';
  writeQueue = writeQueue.then(() => fs.promises.appendFile(DB_FILE, line).catch(() => {}));
}

// ---------- 中间件 ----------
app.use(express.json({ limit: '64kb' }));
app.use(express.static(__dirname, { index: 'index.html' }));

// 简易限流：同一IP每分钟最多60次上报
const rateMap = new Map();
function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  const now = Date.now();
  const rec = rateMap.get(ip) || { count: 0, reset: now + 60000 };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + 60000; }
  rec.count++;
  rateMap.set(ip, rec);
  if (rec.count > 60) return res.status(429).json({ ok: false });
  next();
}

// ---------- 埋点上报 ----------
const VALID_EVENTS = new Set(['page_view', 'start', 'answer', 'complete', 'share', 'restart']);

app.post('/api/track', rateLimit, (req, res) => {
  try {
    const b = req.body || {};
    if (!VALID_EVENTS.has(b.event)) return res.status(400).json({ ok: false });
    const now = Date.now();
    const date = new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10); // UTC+8
    saveEvent({
      event: b.event,
      visitor_id: String(b.visitor_id || '').slice(0, 64),
      session_id: String(b.session_id || '').slice(0, 64),
      channel: String(b.channel || 'direct').slice(0, 32),
      type_code: b.type_code ? String(b.type_code).slice(0, 8) : null,
      persona_name: b.persona_name ? String(b.persona_name).slice(0, 32) : null,
      product: b.product ? String(b.product).slice(0, 64) : null,
      match_type: b.match_type ? String(b.match_type).slice(0, 64) : null,
      question_no: Number.isInteger(b.question_no) ? b.question_no : null,
      ts: now,
      date
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

// ---------- 健康检查 ----------
app.get('/api/health', (req, res) => res.json({ ok: true, events: events.length }));

// ---------- 管理鉴权 ----------
function auth(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN) return res.status(401).json({ ok: false, msg: 'unauthorized' });
  next();
}

// ---------- 统计计算 ----------
function inRange(ev, from, to) {
  if (from && ev.date < from) return false;
  if (to && ev.date > to) return false;
  return true;
}
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

function aggregate(query) {
  const from = validDate(query.from) ? query.from : null;
  const to = validDate(query.to) ? query.to : null;
  const evs = events.filter(ev => inRange(ev, from, to));

  let pageViews = 0, starts = 0, completes = 0, shares = 0;
  const visitors = new Set();
  const dailyMap = new Map(), channelMap = new Map(), personaMap = new Map(), productMap = new Map(), matchMap = new Map();
  const funnelSessions = new Map(); // question_no -> Set(session_id)

  for (const ev of evs) {
    const d = dailyMap.get(ev.date) || { date: ev.date, page_views: 0, starts: 0, completes: 0, shares: 0, _visitors: new Set() };
    if (ev.event === 'page_view') { pageViews++; d.page_views++; if (ev.visitor_id) { visitors.add(ev.visitor_id); d._visitors.add(ev.visitor_id); }
      const ch = channelMap.get(ev.channel) || { channel: ev.channel, page_views: 0, starts: 0, completes: 0, _visitors: new Set() };
      ch.page_views++; if (ev.visitor_id) ch._visitors.add(ev.visitor_id); channelMap.set(ev.channel, ch);
    }
    if (ev.event === 'start') { starts++; d.starts++;
      const ch = channelMap.get(ev.channel) || { channel: ev.channel, page_views: 0, starts: 0, completes: 0, _visitors: new Set() };
      ch.starts++; channelMap.set(ev.channel, ch);
    }
    if (ev.event === 'complete') { completes++; d.completes++;
      const ch = channelMap.get(ev.channel) || { channel: ev.channel, page_views: 0, starts: 0, completes: 0, _visitors: new Set() };
      ch.completes++; channelMap.set(ev.channel, ch);
      const key = ev.type_code || 'UNKNOWN';
      const p = personaMap.get(key) || { type_code: key, persona_name: ev.persona_name, product: ev.product, count: 0 };
      p.count++; personaMap.set(key, p);
      if (ev.product) productMap.set(ev.product, (productMap.get(ev.product) || 0) + 1);
      if (ev.match_type) matchMap.set(ev.match_type, (matchMap.get(ev.match_type) || 0) + 1);
    }
    if (ev.event === 'share') { shares++; d.shares++; }
    if (ev.event === 'answer' && ev.question_no != null && ev.session_id) {
      if (!funnelSessions.has(ev.question_no)) funnelSessions.set(ev.question_no, new Set());
      funnelSessions.get(ev.question_no).add(ev.session_id);
    }
    dailyMap.set(ev.date, d);
  }

  const daily = [...dailyMap.values()].sort((a, b) => a.date < b.date ? -1 : 1)
    .map(d => ({ date: d.date, page_views: d.page_views, visitors: d._visitors.size, starts: d.starts, completes: d.completes, shares: d.shares }));
  const channels = [...channelMap.values()].sort((a, b) => b.page_views - a.page_views)
    .map(c => ({ channel: c.channel, page_views: c.page_views, visitors: c._visitors.size, starts: c.starts, completes: c.completes }));
  const personas = [...personaMap.values()].sort((a, b) => b.count - a.count);
  const products = [...productMap.entries()].map(([product, count]) => ({ product, count })).sort((a, b) => b.count - a.count);
  const matches = [...matchMap.entries()].map(([match_type, count]) => ({ match_type, count })).sort((a, b) => b.count - a.count);
  const funnel = [...funnelSessions.entries()].map(([question_no, set]) => ({ question_no, count: set.size })).sort((a, b) => a.question_no - b.question_no);

  return {
    summary: {
      page_views: pageViews,
      unique_visitors: visitors.size,
      starts, completes, shares,
      start_rate: pageViews ? +(starts / pageViews * 100).toFixed(1) : 0,
      completion_rate: starts ? +(completes / starts * 100).toFixed(1) : 0,
      share_rate: completes ? +(shares / completes * 100).toFixed(1) : 0
    },
    daily, channels, personas, products, matches, funnel
  };
}

app.get('/api/stats', auth, (req, res) => {
  res.json(Object.assign({ ok: true }, aggregate(req.query)));
});

// ---------- CSV导出 ----------
app.get('/api/export', auth, (req, res) => {
  const d = aggregate(req.query);
  const type = req.query.type || 'daily';
  let header, data;
  if (type === 'personas') {
    header = ['人格代码', '人格名称', '推荐产品', '次数'];
    data = d.personas.map(r => [r.type_code, r.persona_name, r.product, r.count]);
  } else if (type === 'channels') {
    header = ['渠道', '访问量', '访客数', '开始数', '完成数'];
    data = d.channels.map(r => [r.channel, r.page_views, r.visitors, r.starts, r.completes]);
  } else {
    header = ['日期', '访问量', '访客数', '开始测试', '完成测试', '分享次数'];
    data = d.daily.map(r => [r.date, r.page_views, r.visitors, r.starts, r.completes, r.shares]);
  }
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [header, ...data].map(r => r.map(esc).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="cbti_${type}_${Date.now()}.csv"`);
  res.send(csv);
});

// ---------- 看板页面 ----------
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.listen(PORT, () => console.log(`CBTI analytics server running on :${PORT}`));
