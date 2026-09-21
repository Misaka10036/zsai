const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const { JSDOM } = createRequire(path.join(root, 'web/package.json'))('jsdom');
const portal = path.join(root, '智盛fontend');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
async function page(html, scripts) {
  const dom = new JSDOM(html.replace(/<\?php[\s\S]*?\?>/g, ''), { url: 'http://portal.test', runScripts: 'outside-only' });
  await new Promise(resolve => dom.window.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const w = dom.window;
  w.alerts = [];
  w.alert = message => w.alerts.push(message);
  w.confirm = () => true;
  w.bootstrap = { Modal: { getInstance: () => ({ hide() {} }), getOrCreateInstance: () => ({ show() {} }) } };
  for (const script of ['js/main.js', ...scripts]) w.eval(fs.readFileSync(path.join(portal, script), 'utf8'));
  return dom;
}
const template = name => fs.readFileSync(path.join(portal, 'views', name), 'utf8');

async function listsAndRoles() {
  const dom = await page('<div id="ragflowGraphCanvas"></div>', ['js/app.js']);
  const w = dom.window;
  const calls = [];
  w.fetch = async url => {
    calls.push(url);
    const p = Number(new URL(url, 'http://portal.test').searchParams.get('page'));
    return { ok: true, json: async () => ({ code: 0, data: { total: 51, datasets: p === 1
      ? Array.from({ length: 50 }, (_, i) => ({ id: String(i) })) : [{ id: 'last' }] } }) };
  };
  assert.equal((await w.portalList('dataset_list', ['datasets'])).length, 51);
  assert.equal(calls.length, 2);
  w.fetch = async () => ({ ok: true, json: async () => ({ code: 401, message: '请先登录' }) });
  await assert.rejects(w.portalList('dataset_list', ['datasets']), /请先登录/);
  w.document.body.dataset.portalRole = 'user';
  w.showEmptyGraphGuide('kb', '知识库');
  assert.equal(w.document.querySelector('#ragflowGraphCanvas button'), null);
  w.document.body.dataset.portalRole = 'admin';
  w.showEmptyGraphGuide('kb', '知识库');
  assert.match(w.document.querySelector('#ragflowGraphCanvas button').textContent, /立即构建/);
  dom.window.close();
}

async function chatIsolation() {
  const dom = await page(template('user/chat.php'), ['js/chat.js']);
  const w = dom.window;
  w.currentChatId = 'chat';
  w.currentSessionId = 'old';
  const answer = deferred();
  let sends = 0;
  w.portalRequest = async (action) => {
    if (action === 'chat_send') { sends++; return answer.promise; }
    if (action.startsWith('chat_session_detail')) return { messages: [{ role: 'assistant', content: 'new history' }] };
    throw new Error(action);
  };
  const input = w.document.getElementById('chatInputMessage');
  input.value = 'old question';
  const sending = w.sendChatMessage();
  input.value = 'duplicate';
  await w.sendChatMessage();
  assert.equal(sends, 1);
  await w.switchSession('new');
  answer.resolve({ answer: 'OLD ANSWER' });
  await sending;
  assert.doesNotMatch(w.document.getElementById('chatMessageStream').textContent, /OLD ANSWER|old question/);
  assert.match(w.document.getElementById('chatMessageStream').textContent, /new history/);

  w.prompt = () => 'new session';
  w.portalRequest = async action => {
    if (action === 'chat_session_create') return { id: 'created' };
    if (action.startsWith('chat_session_detail')) return { messages: [] };
    if (action.startsWith('chat_session_list')) return [{ id: 'created', name: 'new session' }];
    throw new Error(action);
  };
  await w.createNewChatSession();
  assert.equal(w.currentSessionId, 'created');
  assert.doesNotMatch(w.document.getElementById('chatMessageStream').textContent, /new history/);
  w.portalRequest = async () => { throw new Error('后端离线'); };
  await w.fetchSessionMessages('created');
  assert.match(w.document.getElementById('chatMessageStream').textContent, /读取历史失败.*后端离线/);
  input.value = 'retry me';
  await w.sendChatMessage();
  assert.equal(input.value, 'retry me');
  assert.match(w.document.getElementById('chatMessageStream').textContent, /回答失败/);

  w.portalRequest = async () => ({ messages: [
    { role: 'assistant', content: 'hello' }, { role: 'user', content: 'q' }, { role: 'assistant', content: 'answer', id: 'id1' },
  ], reference: [{ chunks: [{ kb_id: 'kb', doc_id: 'doc', docnm_kwd: 'source.pdf', content_with_weight: '<script>bad()</script>' }] }] });
  await w.fetchSessionMessages('created');
  assert.match(w.document.getElementById('chatMessageStream').textContent, /source.pdf/);
  assert.equal(w.document.querySelector('#chatMessageStream script'), null);
  dom.window.close();
}

async function searchConfigurationAndIsolation() {
  const dom = await page(template('admin/search.php'), ['js/search.js']);
  const w = dom.window;
  w.portalList = async () => [{ id: 'kb', name: 'Knowledge' }];
  await w.showCreateAppModal();
  w.document.getElementById('newAppName').value = 'Search';
  w.document.getElementById('searchDatasetIds').options[0].selected = true;
  let saved;
  w.portalRequest = async (action, data) => { saved = { action, data }; return { search_id: 'created' }; };
  w.loadSearchApps = async () => {};
  await w.confirmCreateApp();
  assert.equal(saved.action, 'search_app_create');
  assert.deepEqual(Array.from(saved.data.kb_ids), ['kb']);
  w.portalRequest = async () => ({ name: 'Existing', search_config: { kb_ids: ['kb'] } });
  await w.editSearchApp('existing');
  w.portalRequest = async (action, data) => { saved = { action, data }; return {}; };
  await w.confirmCreateApp();
  assert.equal(saved.action, 'search_app_update');
  assert.deepEqual(Array.from(saved.data.search_config.kb_ids), ['kb']);

  const response = deferred();
  let count = 0;
  w.portalRequest = async () => { count++; return response.promise; };
  w.selectApp('first');
  w.document.getElementById('searchQueryInput').value = 'question';
  const pending = w.executeSearch();
  await w.executeSearch();
  assert.equal(count, 1);
  w.selectApp('second');
  response.resolve({ answer: 'STALE RESULT' });
  await pending;
  assert.doesNotMatch(w.document.getElementById('searchResultsArea').textContent, /STALE RESULT/);
  w.portalRequest = async () => { throw new Error('unavailable'); };
  await w.executeSearch();
  assert.match(w.document.getElementById('searchResultsArea').textContent, /unavailable/);
  dom.window.close();
}

async function uploadRetryAndParsing() {
  const dom = await page(template('admin/dataset.php'), ['js/dataset.js']);
  const w = dom.window;
  w.currentDataset = { id: 'kb' };
  w.document.body.dataset.portalRole = 'admin';
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  w.fetchFileList = () => {};
  const files = [new w.File(['a'], 'same.txt'), new w.File(['b'], 'same.txt')];
  const fileInput = w.document.getElementById('fileInput');
  Object.defineProperty(fileInput, 'files', { value: files });
  fileInput.dispatchEvent(new w.Event('change'));
  const uploads = [];
  let attempt = 0;
  w.fetch = async (url, options) => {
    uploads.push(options.body.get('files[]'));
    const fail = ++attempt === 2;
    return { ok: true, json: async () => fail ? { code: 400, message: 'rejected' } : { code: 0, data: [{ id: 'doc' + attempt }] } };
  };
  const parsed = [];
  w.portalRequest = async (action, data) => { parsed.push({ action, data }); return true; };
  const button = w.document.getElementById('btnConfirmUpload');
  button.click();
  button.click();
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(uploads.length, 2);
  assert.match(w.document.getElementById('uploadStatusText').textContent, /成功 1 个，失败 1 个/);
  assert.deepEqual(Array.from(parsed[0].data.document_ids), ['doc1']);
  button.click();
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(uploads.length, 3);
  assert.equal(uploads[2], files[1]);
  assert.deepEqual(Array.from(parsed[1].data.document_ids), ['doc3']);
  dom.window.close();
}

async function documentErrorsAndPreview() {
  const dom = await page(template('user/dataset.php'), ['js/app.js', 'js/dataset.js']);
  const w = dom.window;
  w.currentDataset = { id: 'kb' };
  w.fetch = async () => ({ json: async () => ({ code: 403, message: 'denied' }) });
  w.fetchFileList(1);
  await tick();
  assert.match(w.document.getElementById('fileTableBody').textContent, /读取文档列表失败.*denied/);
  assert.doesNotMatch(w.document.getElementById('fileTableBody').textContent, /暂无文档/);
  w.document.body.dataset.portalRole = 'user';
  w.fetch = async () => ({ json: async () => ({ code: 0, data: { total: 1, docs: [{ id: 'doc', name: 'test.txt', run: '3', status: '1' }] } }) });
  w.fetchFileList(1);
  await tick();
  assert.doesNotMatch(w.document.getElementById('fileTableBody').textContent, /编辑|停止/);
  assert.match(w.document.getElementById('fileTableBody').textContent, /解析完成/);
  // PHP includes are absent from this DOM fixture, so add the preview template.
  w.document.body.insertAdjacentHTML('beforeend', fs.readFileSync(path.join(portal, 'templates/preview_modal.php'), 'utf8'));
  w.bootstrap.Modal.getInstance = () => ({ show() {} });
  let fetched = false;
  w.fetch = async () => { fetched = true; throw new Error('binary should not be read as text'); };
  w.previewFile('kb', 'doc', 'report.docx');
  assert.equal(fetched, false);
  assert.match(w.document.getElementById('previewModalBody').textContent, /不支持在线预览/);
  dom.window.close();
}

async function agentCancellation() {
  const dom = await page(template('admin/agent.php'), ['js/agent.js']);
  const w = dom.window;
  w.currentAgentId = 'agent';
  w.agentReady = true;
  w.prompt = () => 'hello';
  const completion = deferred();
  const calls = [];
  w.portalRequest = async (action, data) => {
    calls.push({ action, data });
    if (action === 'agent_session_create') return { id: 'session' };
    if (action === 'agent_converse') return completion.promise;
    if (action === 'agent_cancel') return true;
    throw new Error(action);
  };
  const running = w.startAgent();
  await tick();
  assert.equal(calls[1].data.session_id, 'session');
  await w.stopAgent();
  assert.equal(calls[2].action, 'agent_cancel');
  assert.equal(calls[2].data.session_id, 'session');
  completion.resolve({ data: { content: 'SHOULD NOT APPEAR' } });
  await running;
  assert.equal(w.isRunning, false);
  assert.doesNotMatch(w.document.getElementById('logBody').textContent, /SHOULD NOT APPEAR|任务执行完成/);
  w.portalRequest = async () => { throw new Error('denied'); };
  await w.loadAgentDetail('agent');
  assert.equal(w.agentReady, false);
  assert.equal(w.document.getElementById('btnRun').disabled, true);
  assert.match(w.document.getElementById('logBody').textContent, /工作流加载失败.*denied/);
  w.agentReady = true;
  w.currentSessionId = 'existing';
  const continued = deferred();
  const continuedCalls = [];
  w.portalRequest = async (action, data) => {
    continuedCalls.push({ action, data });
    if (action === 'agent_cancel') throw new Error('cancel unavailable');
    return continued.promise;
  };
  const nextRun = w.startAgent();
  await tick();
  assert.equal(continuedCalls[0].action, 'agent_converse');
  assert.equal(continuedCalls[0].data.session_id, 'existing');
  await w.stopAgent();
  assert.equal(w.isRunning, true);
  assert.match(w.document.getElementById('logBody').textContent, /取消失败.*cancel unavailable/);
  continued.resolve({ data: { content: 'finished normally' } });
  await nextRun;
  assert.match(w.document.getElementById('logBody').textContent, /finished normally/);
  dom.window.close();
}

async function localAssets() {
  for (const dir of ['admin', 'user']) {
    for (const file of fs.readdirSync(path.join(portal, 'views', dir))) {
      const html = template(dir + '/' + file);
      for (const match of html.matchAll(/(?:src|href)="([^"<>]+)"/g)) {
        const url = match[1];
        assert.doesNotMatch(url, /^https?:/, file + ' must load resources locally');
        if (/^\/(vendor|js|css)\//.test(url)) assert.ok(fs.existsSync(path.join(portal, url)), url);
      }
    }
    assert.match(template(dir + '/search.php'), /src="\/vendor\/pdfjs\/pdf.min.js"/);
    assert.match(template(dir + '/search.php'), /src="\/vendor\/echarts\/echarts.min.js"/);
  }
}

async function bundledPDF() {
  const pdfjs = require(path.join(portal, 'vendor/pdfjs/pdf.min.js'));
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(portal, 'vendor/pdfjs/pdf.worker.min.js');
  const stream = 'BT /F1 12 Tf 20 40 Td (Portal PDF) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const task = pdfjs.getDocument({ data: new Uint8Array(Buffer.from(pdf)), isEvalSupported: false,
    standardFontDataUrl: path.join(portal, 'vendor/pdfjs/standard_fonts') + path.sep });
  try {
    const doc = await task.promise;
    assert.equal(doc.numPages, 1);
    const content = await (await doc.getPage(1)).getTextContent();
    assert.equal(content.items[0].str, 'Portal PDF');
  } finally { await task.destroy(); }
}

async function cancellationProxy() {
  const { createPortalProxy } = require(path.join(root, 'tools/php-dev-proxy.cjs'));
  const waiting = deferred();
  const regular = http.createServer(async (req, res) => { await waiting.promise; res.end('finished'); });
  const control = http.createServer((req, res) => { assert.match(req.url, /agent_cancel/); res.end('cancelled'); });
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await listen(regular); await listen(control);
  const proxy = createPortalProxy([regular.address().port], control.address().port);
  await listen(proxy);
  const url = 'http://127.0.0.1:' + proxy.address().port;
  try {
    const completion = fetch(url + '/api.php?action=agent_converse');
    const cancel = await fetch(url + '/api.php?action=agent_cancel', { signal: AbortSignal.timeout(2000) });
    assert.equal(await cancel.text(), 'cancelled');
    waiting.resolve();
    assert.equal(await (await completion).text(), 'finished');
  } finally {
    waiting.resolve();
    for (const server of [proxy, regular, control]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
}

(async () => {
  for (const test of [listsAndRoles, chatIsolation, searchConfigurationAndIsolation, uploadRetryAndParsing, documentErrorsAndPreview, agentCancellation, localAssets, bundledPDF, cancellationProxy]) {
    await test();
    console.log('PASS', test.name);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
