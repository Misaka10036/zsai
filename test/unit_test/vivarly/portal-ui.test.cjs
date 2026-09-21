const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const requireWeb = createRequire(path.join(root, 'web/package.json'));
const { JSDOM } = requireWeb('jsdom');
const portal = path.join(root, '智盛fontend');

async function checkSearchPage(relativePath) {
  const html = fs.readFileSync(path.join(portal, relativePath), 'utf8').replace(/<\?php[\s\S]*?\?>/g, '');
  const dom = new JSDOM(html, { url: 'http://portal.test', runScripts: 'outside-only' });
  const w = dom.window;
  await new Promise(resolve => w.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const calls = [];
  w.fetch = async (url, options) => {
    calls.push({ url, options });
    return { json: async () => url.includes('search_app_list')
      ? { code: 0, data: { search_apps: [{ id: 'search1', name: 'Shared search' }] } }
      : { code: 0, data: { answer: '**Answer**<img src=x onerror="alert(1)"><script>alert(1)</script>', reference: { chunks: [] } } } };
  };
  for (const file of ['vendor/marked/marked.min.js', 'vendor/dompurify/purify.min.js', 'js/main.js', 'js/search.js']) {
    w.eval(fs.readFileSync(path.join(portal, file), 'utf8'));
  }
  w.loadSearchApps();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(w.currentSearchId, 'search1');
  const select = w.document.getElementById('searchAppSelect');
  if (select) assert.equal(select.value, 'search1');
  w.document.getElementById('searchQueryInput').value = 'question';
  w.executeSearch();
  await new Promise(resolve => setImmediate(resolve));
  const area = w.document.getElementById('searchResultsArea');
  assert.match(area.textContent, /Answer/);
  assert.equal(area.querySelector('script,[onerror]'), null);
  assert.equal(JSON.parse(calls.at(-1).options.body).search_id, 'search1');
  const malicious = w.renderSafeMarkdown('[bad](javascript:alert(1))<svg onload="alert(1)"></svg>');
  assert.doesNotMatch(malicious, /javascript:|onload/);
  w.DOMPurify = undefined;
  assert.equal(w.renderSafeMarkdown('<img onerror=x>'), '&lt;img onerror=x&gt;');
  dom.window.close();
  console.log('PASS search selection, execution and HTML sanitization:', relativePath);
}

async function checkGraphBuild() {
  const dom = new JSDOM('', { url: 'http://portal.test', runScripts: 'outside-only' });
  const w = dom.window;
  const messages = [];
  w.alert = message => messages.push(message);
  w.eval(fs.readFileSync(path.join(portal, 'js/app.js'), 'utf8'));
  const cases = [
    { status: 200, body: { code: 0, data: { task_id: 'task1' } }, expected: /已提交 GraphRAG/ },
    { status: 200, body: { code: 102, message: 'No documents in Dataset kb' }, expected: /图谱构建失败：No documents/ },
    { status: 200, body: { code: 403, message: '需要管理员权限' }, expected: /图谱构建失败：需要管理员权限/ },
    { status: 502, body: { code: 0, message: 'Bad gateway' }, expected: /图谱构建失败：Bad gateway/ },
    { status: 200, body: { code: 0, data: {} }, expected: /未返回构建任务 ID/ },
    { status: 200, body: null, expected: /图谱构建失败/ },
    { status: 502, invalidJSON: true, expected: /无效响应/ },
    { networkError: true, expected: /图谱构建失败：Failed to fetch/ },
  ];
  for (const test of cases) {
    messages.length = 0;
    w.fetch = async (url, options) => {
      assert.equal(url, '/api.php?action=dataset_run_graph');
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), { dataset_id: 'kb' });
      if (test.networkError) throw new Error('Failed to fetch');
      return { status: test.status, ok: test.status < 400, json: async () => {
        if (test.invalidJSON) throw new SyntaxError('Unexpected token');
        return test.body;
      } };
    };
    await w.triggerBuildGraphRAG('kb');
    assert.equal(messages.length, 1);
    assert.match(messages[0], test.expected);
  }
  dom.window.close();
  console.log('PASS graph submission: success, business/permission/HTTP/network failures and invalid responses (8 cases)');
}

async function checkGraphLoadFailure() {
  const dom = new JSDOM('<div id="ragflowGraphCanvas"></div>', { runScripts: 'outside-only' });
  const w = dom.window;
  for (const file of ['js/main.js', 'js/app.js']) w.eval(fs.readFileSync(path.join(portal, file), 'utf8'));
  for (const response of [
    { ok: true, status: 200, json: async () => ({ code: 403, message: 'no authorization' }) },
    { ok: false, status: 502, json: async () => ({ code: 0 }) },
    { ok: false, status: 502, json: async () => { throw new Error('Invalid JSON'); } },
  ]) {
    w.graphChartInstance = { showLoading() {}, hideLoading() {}, dispose() {} };
    w.fetch = async () => response;
    await w.loadKnowledgeGraph('kb');
    const content = w.document.getElementById('ragflowGraphCanvas').textContent;
    assert.match(content, /图谱加载失败/);
    assert.doesNotMatch(content, /尚未构建|立即构建/);
  }
  await w.loadKnowledgeGraph('kb');
  assert.match(w.document.getElementById('ragflowGraphCanvas').textContent, /图谱组件未加载/);
  dom.window.close();
  console.log('PASS graph loading: failures never appear as an empty graph; missing chart dependency is reported');
}

(async () => {
  await checkGraphBuild();
  await checkGraphLoadFailure();
  await checkSearchPage('views/user/search.php');
  await checkSearchPage('views/admin/search.php');
})().catch(error => { console.error(error); process.exitCode = 1; });
