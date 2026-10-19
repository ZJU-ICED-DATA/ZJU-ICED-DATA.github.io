/* =========================================================================
   lab-api — 实验室安全与设备管理的云端接口（Cloudflare Worker）
   -------------------------------------------------------------------------
   存储直接用 GitHub 仓库，不需要 KV / D1 / R2：
     lab/data/records.json      所有备案与检查记录
     lab/data/photos/<id>.jpg   检查照片（前端已压缩，约 80–150 KB）

   环境变量 / Secret：
     GITHUB_TOKEN  有 repo 写权限的令牌（必填）
     LAB_CODE      实验室代码，前端提交时要带上（必填）
     REPO          如 ZJU-ICED-DATA/ZJU-ICED-DATA.github.io
     BRANCH        默认 main
     ALLOWED_ORIGIN 允许的站点，默认 *

   接口：
     GET  /api/ping                       健康检查
     GET  /api/list?from&to&code          读取区间内记录
     POST /api/submit  {code, record, photos[]}
     GET  /api/photo?id&code              返回图片
   ========================================================================= */

const RECORDS_PATH = 'lab/data/records.json';
const OPTIONS_PATH = 'lab/data/options.json';
const PHOTO_DIR = 'lab/data/photos/';
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/api/ping') {
        return json({ ok: true, repo: env.REPO || '', time: new Date().toISOString() }, 200, cors);
      }

      if (url.pathname === '/api/list') {
        const from = url.searchParams.get('from') || '0000-00-00';
        const to = url.searchParams.get('to') || '9999-99-99';
        const all = await readRecords(env);
        const records = all.filter(r => r.date >= from && r.date <= to);
        return json({ ok: true, records }, 200, cors);
      }

      if (url.pathname === '/api/submit' && request.method === 'POST') {
        const body = await request.json();

        const record = body.record;
        if (!record || !record.type || !record.date || !record.name) {
          return json({ ok: false, error: '记录格式不完整' }, 400, cors);
        }

        const photos = Array.isArray(body.photos) ? body.photos : [];
        const files = [];
        for (const p of photos) {
          if (!p || !p.id || typeof p.dataUrl !== 'string') continue;
          const b64 = p.dataUrl.split(',')[1] || '';
          if (!b64) continue;
          const bytes = Math.floor(b64.length * 0.75);
          if (bytes > MAX_PHOTO_BYTES) return json({ ok: false, error: '有照片太大，请压缩后重试' }, 413, cors);
          files.push({ path: PHOTO_DIR + p.id + '.jpg', base64: b64 });
        }

        record.serverTime = new Date().toISOString();
        await appendRecord(env, record, files);
        return json({ ok: true, id: record.id, photos: files.length }, 200, cors);
      }

      if (url.pathname === '/api/options') {
        if (request.method === 'GET') {
          const opts = await readJsonFile(env, OPTIONS_PATH, {});
          return json({ ok: true, options: opts }, 200, cors);
        }
        if (request.method === 'POST') {
          const body = await request.json();
          const opts = body.options || {};
          await writeJsonFile(env, OPTIONS_PATH, JSON.stringify(opts, null, 1), '更新实验室选项（成员 / 设备 / 时长）');
          return json({ ok: true }, 200, cors);
        }
      }

      if (url.pathname === '/api/photo') {
        const id = url.searchParams.get('id') || '';
        if (!/^[\w-]+$/.test(id)) return new Response('bad id', { status: 400 });
        return photoResponse(env, id);
      }

      return json({ ok: false, error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e) }, 500, cors);
    }
  }
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }, headers || {})
  });
}


function gh(env, path, init) {
  const base = 'https://api.github.com';
  const headers = Object.assign({
    'Authorization': 'Bearer ' + (env.GITHUB_TOKEN || ''),
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'lab-api',
    'X-GitHub-Api-Version': '2022-11-28'
  }, (init && init.headers) || {});
  return fetch(base + path, Object.assign({}, init, { headers }));
}

function repoPath(env, sub) {
  return '/repos/' + env.REPO + sub;
}

async function readRecords(env) {
  const branch = env.BRANCH || 'main';
  const r = await gh(env, repoPath(env, '/contents/' + RECORDS_PATH + '?ref=' + branch));
  if (r.status === 404) return [];
  if (!r.ok) throw new Error('读取记录失败：' + r.status);
  const j = await r.json();
  const decoded = b64ToUtf8(j.content);
  try {
    const data = JSON.parse(decoded);
    return Array.isArray(data) ? data : (data.records || []);
  } catch (e) {
    return [];
  }
}

/* GitHub 返回的是 base64，需要按 UTF-8 还原中文 */
function b64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\n/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* 读取一个 JSON 文件，不存在时返回默认值 */
async function readJsonFile(env, path, fallback) {
  const branch = env.BRANCH || 'main';
  const r = await gh(env, repoPath(env, '/contents/' + path + '?ref=' + branch));
  if (r.status === 404) return fallback;
  if (!r.ok) throw new Error('读取失败：' + r.status);
  const j = await r.json();
  try { return JSON.parse(b64ToUtf8(j.content)); } catch (e) { return fallback; }
}

/* 写入/更新一个 JSON 文件（单文件，走 Contents API） */
async function writeJsonFile(env, path, content, message) {
  const branch = env.BRANCH || 'main';
  let sha;
  const cur = await gh(env, repoPath(env, '/contents/' + path + '?ref=' + branch));
  if (cur.ok) sha = (await cur.json()).sha;

  const body = { message, content: b64utf8(content), branch };
  if (sha) body.sha = sha;

  const r = await gh(env, repoPath(env, '/contents/' + path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('写入失败：' + r.status);
}

async function appendRecord(env, record, files) {
  const branch = env.BRANCH || 'main';

  /* 1. 读当前记录 */
  const existing = await readRecords(env);

  /* 简单去重：同一 id 不重复写入 */
  if (!existing.some(r => r.id === record.id)) existing.push(record);
  existing.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));

  const content = JSON.stringify({ updatedAt: new Date().toISOString(), records: existing }, null, 1);

  /* 2. 取 HEAD */
  const refRes = await gh(env, repoPath(env, '/git/ref/heads/' + branch));
  if (!refRes.ok) throw new Error('读取分支失败：' + refRes.status);
  const head = (await refRes.json()).object.sha;

  const commitRes = await gh(env, repoPath(env, '/git/commits/' + head));
  if (!commitRes.ok) throw new Error('读取提交失败：' + commitRes.status);
  const baseTree = (await commitRes.json()).tree.sha;

  /* 3. 上传照片与记录为新 blob */
  const tree = [];

  for (const f of files) {
    const bl = await gh(env, repoPath(env, '/git/blobs'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: f.base64, encoding: 'base64' })
    });
    if (!bl.ok) throw new Error('上传照片失败：' + bl.status);
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: (await bl.json()).sha });
  }

  const recBlob = await gh(env, repoPath(env, '/git/blobs'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: b64utf8(content), encoding: 'base64' })
  });
  if (!recBlob.ok) throw new Error('写入记录失败：' + recBlob.status);
  tree.push({ path: RECORDS_PATH, mode: '100644', type: 'blob', sha: (await recBlob.json()).sha });

  /* 4. 建树、提交、更新分支 */
  const treeRes = await gh(env, repoPath(env, '/git/trees'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: baseTree, tree })
  });
  if (!treeRes.ok) throw new Error('建树失败：' + treeRes.status);
  const newTree = (await treeRes.json()).sha;

  const label = record.type === 'check' ? '实验室夜间检查' : '设备使用备案';
  const newCommit = await gh(env, repoPath(env, '/git/commits'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: label + '：' + record.date + ' ' + record.name,
      tree: newTree,
      parents: [head]
    })
  });
  if (!newCommit.ok) throw new Error('提交失败：' + newCommit.status);
  const commitSha = (await newCommit.json()).sha;

  const upd = await gh(env, repoPath(env, '/git/refs/heads/' + branch), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commitSha, force: false })
  });
  if (!upd.ok) throw new Error('更新分支失败（可能有人同时提交，请重试）：' + upd.status);
}

function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function photoResponse(env, id) {
  const branch = env.BRANCH || 'main';
  const path = PHOTO_DIR + id + '.jpg';
  const r = await gh(env, repoPath(env, '/contents/' + path + '?ref=' + branch));
  if (!r.ok) return new Response('not found', { status: 404 });
  const j = await r.json();
  const bin = atob(j.content.replace(/\n/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000' }
  });
}
