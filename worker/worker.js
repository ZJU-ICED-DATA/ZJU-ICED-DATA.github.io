/* =========================================================================
   Cloudflare Worker —— 催化剂数据库的发布代理
   -------------------------------------------------------------------------
   作用：网页端把新记录 POST 到这里，Worker 用服务端保存的 GitHub 令牌
   把记录追加进仓库的 data.js，触发 GitHub Pages 重新构建。

   这样 GitHub 令牌永远不会出现在浏览器里；网页端只持有一个可随时更换的
   PUBLISH_KEY。

   端点：
     GET  /api/health    连通性检查（需密钥）
     POST /api/records   { records: [...], message?: "..." }

   需要配置的环境变量 / 密钥：
     GITHUB_TOKEN    (Secret)  fine-grained PAT，仅需该仓库 Contents: Read and write
     PUBLISH_KEY     (Secret)  网页端填的发布密钥，自己定一个长随机串
     REPO            变量      例如 njustzhangmj/ZJU-ICED-DATA.github.io
     BRANCH          变量      main
     DATA_PATH       变量      data.js
     ALLOWED_ORIGIN  变量      https://njustzhangmj.github.io
   ========================================================================= */

const JSON_HEADERS = { 'Content-Type': 'application/json;charset=utf-8' };

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

function json(body, status, env) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({}, JSON_HEADERS, corsHeaders(env))
  });
}

function b64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
  return new TextDecoder().decode(bytes);
}

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(function (b) { bin += String.fromCharCode(b); });
  return btoa(bin);
}

async function gh(env, path, init) {
  const opts = init || {};
  const headers = Object.assign({
    'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'iced-catalyst-publisher'
  }, opts.headers || {});
  return fetch('https://api.github.com/repos/' + env.REPO + '/contents/' + path, Object.assign({}, opts, { headers: headers }));
}

function checkAuth(request, env) {
  const header = request.headers.get('Authorization') || '';
  const key = header.replace(/^Bearer\s+/i, '').trim();
  if (!env.PUBLISH_KEY) return false;
  return key === env.PUBLISH_KEY;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (!env.GITHUB_TOKEN || !env.REPO) {
      return json({ error: 'Worker 未配置 GITHUB_TOKEN 或 REPO' }, 500, env);
    }

    if (url.pathname === '/api/health') {
      if (!checkAuth(request, env)) return json({ error: 'unauthorized' }, 401, env);
      return json({ ok: true, repo: env.REPO, branch: env.BRANCH || 'main', dataPath: env.DATA_PATH || 'data.js' }, 200, env);
    }

    if (url.pathname !== '/api/records') {
      return json({ error: 'not found' }, 404, env);
    }

    if (request.method !== 'POST') {
      return json({ error: 'method not allowed' }, 405, env);
    }

    if (!checkAuth(request, env)) {
      return json({ error: '发布密钥不正确' }, 401, env);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ error: '请求体不是合法 JSON' }, 400, env);
    }

    const records = Array.isArray(payload.records) ? payload.records : [];
    if (!records.length) return json({ error: '没有要提交的记录' }, 400, env);
    if (records.length > 200) return json({ error: '单次最多提交 200 条' }, 400, env);

    const dataPath = env.DATA_PATH || 'data.js';
    const branch = env.BRANCH || 'main';

    /* 1. 取当前 data.js */
    const getRes = await gh(env, dataPath + '?ref=' + encodeURIComponent(branch));
    if (!getRes.ok) {
      const detail = await getRes.text();
      return json({ error: '读取 data.js 失败', status: getRes.status, detail: detail.slice(0, 300) }, 502, env);
    }
    const file = await getRes.json();
    const text = b64ToUtf8(file.content);

    /* 2. 追加记录（保留文件原有注释与排版） */
    const marker = 'window.CATALYST_DATA = [';
    const at = text.indexOf(marker);
    if (at < 0) return json({ error: 'data.js 中找不到 window.CATALYST_DATA = [' }, 422, env);

    let added = 0;
    let skipped = 0;
    let snippet = '';

    records.forEach(function (r) {
      if (!r || !r.id) { skipped++; return; }
      if (text.indexOf('"id":' + JSON.stringify(r.id)) >= 0) { skipped++; return; }
      snippet += '\n  ' + JSON.stringify(r) + ',';
      added++;
    });

    if (!added) {
      return json({ ok: true, added: 0, skipped: skipped, message: '记录已存在，未重复提交' }, 200, env);
    }

    const insertAt = at + marker.length;
    const updated = text.slice(0, insertAt) + snippet + text.slice(insertAt);

    /* 3. 提交 */
    const putRes = await gh(env, dataPath, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: payload.message || ('新增 ' + added + ' 条催化剂记录（网页上传）'),
        content: utf8ToB64(updated),
        sha: file.sha,
        branch: branch
      })
    });

    if (!putRes.ok) {
      const detail = await putRes.text();
      return json({ error: '提交失败', status: putRes.status, detail: detail.slice(0, 300) }, 502, env);
    }

    const commit = await putRes.json();
    return json({
      ok: true,
      added: added,
      skipped: skipped,
      commit: commit.commit && commit.commit.sha,
      url: commit.commit && commit.commit.html_url
    }, 200, env);
  }
};
