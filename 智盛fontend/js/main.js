/**
 * VIVARILY · 基础工具库
 * 版本: 2.0 (适配新UI样式)
 */

// 安全获取数字类型的大小/数量
function parseValidNumber(item, fields) {
  if (!item || typeof item !== 'object') return 0;
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    if (item[field] !== undefined && item[field] !== null && item[field] !== '') {
      var val = Number(item[field]);
      if (!isNaN(val) && val >= 0) return val;
    }
  }
  return 0;
}

// 获取单文件字节大小
function getValidFileSize(item) {
  return parseValidNumber(item, ['size', 'byte_size', 'file_size', 'bytes', 'length']);
}

// 获取知识库总字节大小
function getDatasetSize(ds) {
  return parseValidNumber(ds, ['size', 'byte_size', 'bytes', 'storage_size']);
}

// 获取知识库文件总数量
function getDatasetDocCount(ds) {
  return parseValidNumber(ds, ['doc_num', 'document_count', 'doc_count', 'file_count']);
}

// 字节格式化
function formatBytes(bytes) {
  var num = Number(bytes);
  if (isNaN(num) || num <= 0) return '0 B';
  var k = 1024;
  var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  var i = Math.floor(Math.log(num) / Math.log(k));
  return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 获取文件图标
function getFileIcon(filename) {
  if (!filename) return 'far fa-file text-secondary';
  var ext = filename.split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return 'far fa-file-pdf text-danger';
  if (['doc', 'docx'].includes(ext)) return 'far fa-file-word text-primary';
  if (['txt', 'md'].includes(ext)) return 'far fa-file-lines text-info';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'far fa-file-image text-warning';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'far fa-file-excel text-success';
  if (['ppt', 'pptx'].includes(ext)) return 'far fa-file-powerpoint text-danger';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'far fa-file-zipper text-secondary';
  return 'far fa-file text-secondary';
}

// HTML转义
function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>"']/g, function(m) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return map[m] || m;
  });
}

// JS字符串转义
function escapeJsString(text) {
  if (!text) return '';
  return String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
}

// 获取当前时间字符串
function getCurrentTimeString() {
  var now = new Date();
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
}

// Fail closed if either optional rendering dependency is unavailable.
function renderSafeMarkdown(text) {
  if (typeof DOMPurify === 'undefined' || typeof marked === 'undefined') {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }
  return DOMPurify.sanitize(marked.parse(String(text || '')), { USE_PROFILES: { html: true } });
}

async function portalRequest(action, data, signal) {
  var response = await fetch('/api.php?action=' + action, data === undefined
    ? { signal: signal }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: signal });
  var result;
  try { result = await response.json(); }
  catch (error) { throw new Error('服务器响应无效（HTTP ' + response.status + '）'); }
  if (response.ok === false || !result || result.code !== 0) {
    throw new Error(result?.message || '请求失败（HTTP ' + response.status + '）');
  }
  return result.data;
}

async function portalList(action, fields) {
  var items = [];
  var seen = new Set();
  for (var page = 1; ; page++) {
    var data = await portalRequest(action + '&page=' + page + '&page_size=50');
    var batch = Array.isArray(data) ? data : fields.map(function(key) { return data?.[key]; }).find(Array.isArray);
    if (!batch) throw new Error('服务器返回的列表格式无效');
    for (var item of batch) {
      if (seen.has(item.id)) throw new Error('列表分页返回了重复数据，请刷新重试');
      seen.add(item.id);
      items.push(item);
    }
    var total = Array.isArray(data) ? null : (data.total ?? data.total_datasets);
    if (batch.length === 0 || (total != null && items.length >= total) || (total == null && batch.length < 50)) return items;
  }
}

function portalIsAdmin() {
  return document.body.dataset.portalRole === 'admin';
}

function renderChatReferences(reference) {
  var chunks = reference?.chunks || [];
  if (!Array.isArray(chunks)) chunks = Object.values(chunks);
  if (!chunks.length) return '';
  return '<details class="mt-2"><summary>引用来源（' + chunks.length + '）</summary>' + chunks.map(function(chunk) {
    var title = chunk.document_name || chunk.docnm_kwd || '引用文档';
    var kb = chunk.dataset_id || chunk.kb_id;
    var doc = chunk.document_id || chunk.doc_id;
    var href = '/api.php?action=file_preview&dataset_id=' + encodeURIComponent(kb) + '&doc_id=' + encodeURIComponent(doc);
    return '<div class="border-top py-2">' + (kb && doc
      ? '<a target="_blank" rel="noopener" href="' + escapeHtml(href) + '">' + escapeHtml(title) + '</a>'
      : escapeHtml(title)) + '<div class="small">' + escapeHtml(chunk.content || chunk.content_with_weight || '') + '</div></div>';
  }).join('') + '</details>';
}
