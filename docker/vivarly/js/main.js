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

// 状态徽章样式映射
function getStatusBadgeText(status) {
  if (status == '1' || status === 'DONE' || status === 'SUCCESS') return '解析完成';
  if (status == '2' || status === 'RUNNING' || status === 'PROCESSING') return '解析中';
  if (status == '3' || status === 'FAILED' || status === 'ERROR') return '解析失败';
  return '未解析';
}

// 获取状态徽章样式类
function getStatusBadgeClass(status) {
  if (status == '1' || status === 'DONE' || status === 'SUCCESS') return 'bg-success-subtle text-success border';
  if (status == '2' || status === 'RUNNING' || status === 'PROCESSING') return 'bg-warning-subtle text-warning border';
  if (status == '3' || status === 'FAILED' || status === 'ERROR') return 'bg-danger-subtle text-danger border';
  return 'bg-secondary-subtle text-secondary border';
}