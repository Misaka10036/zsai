const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const requireWeb = createRequire(path.join(root, 'web/package.json'));
const { JSDOM } = requireWeb('jsdom');
const portal = path.join(root, 'docker/vivarly');

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

(async () => {
  await checkSearchPage('views/user/search.php');
  await checkSearchPage('views/admin/search.php');
})().catch(error => { console.error(error); process.exitCode = 1; });
