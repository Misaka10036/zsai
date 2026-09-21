/**
 * VIVARILY · 核心应用逻辑
 * 版本: 2.0 (适配新UI样式)
 */

window.currentDataset = null;
window.currentSearchApp = null;
window.graphChartInstance = null;
window.currentGraphKbId = '';
window.rawRAGFlowGraph = null;
window.activeGraphNodes = [];
window.activeGraphLinks = [];
window.expandedNodeNames = new Set();
var graphLoadVersion = 0;


document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('datasetListContainer') || document.getElementById('graphKbSelect')) {
    fetchDatasets();
  }

  // 绑定窗口尺寸变化事件，实时动态调节表格窗口高度
  window.addEventListener('resize', adjustTableHeight);

  var btnSubmit = document.getElementById('btnSubmitCreateDataset');
  if (btnSubmit) btnSubmit.addEventListener('click', createDataset);


  var btnRefresh = document.getElementById('btnRefreshGraph');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', function() {
      if (window.currentGraphKbId) {
        loadKnowledgeGraph(window.currentGraphKbId);
      } else {
        fetchDatasets();
      }
    });
  }

  var btnFullscreen = document.getElementById('btnFullscreenGraph');
  if (btnFullscreen) btnFullscreen.addEventListener('click', toggleGraphFullscreen);
});

// ==================== 核心：JS 动态计算表格窗口高度 ====================

function adjustTableHeight() {
  var tableWrap = document.querySelector('.file-table-wrap');
  if (!tableWrap) return;

  var windowHeight = window.innerHeight;
  var usedHeight = 120;

  var navbar = document.querySelector('.navbar');
  var kbHeader = document.querySelector('.kb-header');
  var kbStats = document.querySelector('.kb-stats');
  var tableFooter = document.querySelector('.table-footer');
  var footerBar = document.querySelector('.footer-bar');
  var homeMeta = document.querySelector('.home-meta');

  if (navbar) usedHeight += navbar.offsetHeight;
  if (kbHeader) usedHeight += kbHeader.offsetHeight;
  if (kbStats) usedHeight += kbStats.offsetHeight;
  if (tableFooter) usedHeight += tableFooter.offsetHeight;
  if (footerBar) usedHeight += footerBar.offsetHeight;
  if (homeMeta) usedHeight += homeMeta.offsetHeight;

  var dynamicMaxHeight = Math.max(200, windowHeight - usedHeight);
  tableWrap.style.maxHeight = dynamicMaxHeight + 'px';
  tableWrap.style.overflowY = 'auto';
}

// ==================== 知识库与文件列表管理 ====================

async function fetchDatasets() {
  var container = document.getElementById('datasetListContainer');
  var graphSelect = document.getElementById('graphKbSelect');

  try {
    var datasets = await portalList('dataset_list', ['datasets', 'list']);

    if (graphSelect) {
      if (datasets.length > 0) {
        var optionsHtml = '';
        for (var i = 0; i < datasets.length; i++) {
          var ds = datasets[i];
          optionsHtml += '<option value="' + escapeHtml(ds.id) + '">' + escapeHtml(ds.name) + '</option>';
        }
        graphSelect.innerHTML = optionsHtml;
        graphSelect.onchange = function() { switchGraphByKb(this.value); };

        var firstDs = datasets[0];
        window.currentGraphKbId = firstDs.id;
        
        var titleEl = document.getElementById('currentGraphKbName');
        var footerNameEl = document.getElementById('footerKbName');
        if (titleEl) titleEl.innerText = firstDs.name;
        if (footerNameEl) footerNameEl.innerText = firstDs.name;

        if (document.getElementById('ragflowGraphCanvas')) {
          setTimeout(function() { loadKnowledgeGraph(window.currentGraphKbId); }, 100);
        }
      } else {
        graphSelect.innerHTML = '<option value="">暂无知识库</option>';
      }
    }

    if (container) {
      if (datasets.length === 0) {
        container.innerHTML = '<div class="col-12 text-center text-muted py-3">暂无知识库，请点击"新建"。</div>';
        return;
      }

      var cardsHtml = '';
      for (var j = 0; j < datasets.length; j++) {
        var dsItem = datasets[j];
        var isActive = window.currentDataset && window.currentDataset.id === dsItem.id;
        var dsSize = getDatasetSize(dsItem);
        var docCount = getDatasetDocCount(dsItem);
        var iconClass = (j % 2 === 0) ? 'fa-folder text-primary' : 'fa-database text-info';

        cardsHtml += '<div class="stat-card' + (isActive ? ' active' : '') + '" onclick="selectDataset(\'' + escapeHtml(dsItem.id) + '\', \'' + escapeHtml(dsItem.name) + '\')">';
        cardsHtml += '  <div class="info">';
        cardsHtml += '    <div class="label fw-bold text-dark">' + escapeHtml(dsItem.name) + '</div>';
        cardsHtml += '    <div class="value fs-5 fw-bold text-primary mt-1">' + docCount + ' <span class="fs-6 text-muted font-normal">文件</span></div>';
        cardsHtml += '    <div class="sub small text-muted mt-1">' + escapeHtml(dsItem.description || '暂无说明') + ' · ' + formatBytes(dsSize) + '</div>';
        cardsHtml += '  </div>';
        cardsHtml += '  <div class="icon-circle"><i class="fas ' + iconClass + '"></i></div>';
        cardsHtml += '</div>';
      }
      container.innerHTML = cardsHtml;
    }

    if (typeof selectDataset === 'function' && !window.currentDataset && datasets.length > 0) {
      selectDataset(datasets[0].id, datasets[0].name);
    }

    // 触发自定义事件，通知表格高度调整
    var event = new Event('datasetLoaded');
    document.dispatchEvent(event);

  } catch (err) {
    if (container) container.innerHTML = '<div class="text-danger p-3">知识库加载失败：' + escapeHtml(err.message) + '</div>';
    if (graphSelect) graphSelect.replaceChildren(new Option('加载失败：' + err.message, ''));
  }
}

async function createDataset() {
  var nameInput = document.getElementById('datasetNameInput');
  var descInput = document.getElementById('datasetDescInput');

  if (!nameInput) return;
  var name = nameInput.value.trim();
  var description = descInput ? descInput.value.trim() : '';

  if (!name) {
    alert('请输入知识库名称！');
    return;
  }

  try {
    var response = await fetch('/api.php?action=dataset_create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, description: description })
    });
    var res = await response.json();

    if (res.code === 0 || res.code === 200) {
      var modalEl = document.getElementById('createDatasetModal');
      if (modalEl && typeof bootstrap !== 'undefined') {
        var modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }
      nameInput.value = '';
      if (descInput) descInput.value = '';
      fetchDatasets();
    } else {
      alert('创建失败: ' + (res.message || '未知错误'));
    }
  } catch (err) {
    alert('新建知识库失败：' + err.message);
  }
}

// ==================== 知识图谱相关 ====================

function initGraphCanvas() {
  var container = document.getElementById('ragflowGraphCanvas');
  if (!container) return;
  if (typeof echarts === 'undefined') return;
  if (window.graphChartInstance) window.graphChartInstance.dispose();
  container.replaceChildren();
  window.graphChartInstance = echarts.init(container);
  window.addEventListener('resize', function() {
    if (window.graphChartInstance) window.graphChartInstance.resize();
  });
}

async function loadKnowledgeGraph(datasetId) {
  var container = document.getElementById('ragflowGraphCanvas');
  if (!datasetId || !container) return;
  var version = ++graphLoadVersion;
  try {
    if (!window.graphChartInstance) initGraphCanvas();
    if (!window.graphChartInstance) throw new Error('图谱组件未加载，请检查页面资源后重试');

    window.graphChartInstance.showLoading({
      text: '图谱加载中...',
      color: '#3b82f6',
      textColor: '#64748b',
      maskColor: 'rgba(255, 255, 255, 0.85)'
    });

    var response = await fetch('/api.php?action=dataset_graph&dataset_id=' + datasetId);
    var res = await response.json();
    if (version !== graphLoadVersion) return;
    if (window.graphChartInstance) window.graphChartInstance.hideLoading();
    if (!response.ok || !res || res.code !== 0) {
      throw new Error((res && res.message) || '请求失败（HTTP ' + response.status + '）');
    }

    var rawGraph = res.code === 0 && res.data ? (res.data.graph || res.data) : null;
    window.rawRAGFlowGraph = rawGraph;
    window.expandedNodeNames.clear();

    var graphData = parseRAGFlowGraphArtistic(rawGraph, getSelectedKbName());
    if (!graphData.nodes || graphData.nodes.length <= 1) {
      showEmptyGraphGuide(datasetId, getSelectedKbName());
      return;
    }

    window.activeGraphNodes = graphData.nodes;
    window.activeGraphLinks = graphData.links;
    renderArtisticGraphChart(window.activeGraphNodes, window.activeGraphLinks);

    var nodeCountEl = document.getElementById('nodeCount');
    var edgeCountEl = document.getElementById('edgeCount');
    if (nodeCountEl) nodeCountEl.innerText = graphData.totalNodeCount || graphData.nodes.length;
    if (edgeCountEl) edgeCountEl.innerText = graphData.totalEdgeCount || graphData.links.length;
  } catch (err) {
    if (version !== graphLoadVersion) return;
    if (window.graphChartInstance) window.graphChartInstance.hideLoading();
    container.innerHTML = '<div class="text-danger text-center p-4">图谱加载失败：' + escapeHtml(err.message) + '</div>';
    if (window.graphChartInstance) window.graphChartInstance.dispose();
    window.graphChartInstance = null;
  }
}

function parseRAGFlowGraphArtistic(rawGraph, kbName) {
  var nodes = [{ name: kbName, isCenter: true }];
  var links = [];
  var addedNodeNames = new Set([kbName]);

  var rawNodes = (rawGraph && (rawGraph.nodes || rawGraph.entities)) || [];
  var rawEdges = (rawGraph && (rawGraph.edges || rawGraph.links)) || [];

  if (Array.isArray(rawNodes)) {
    rawNodes = rawNodes.slice().sort(function(a, b) {
      return (b.rank || b.pagerank || 0) - (a.rank || a.pagerank || 0);
    });
    var maxNodes = Math.min(rawNodes.length, 14);
    for (var i = 0; i < maxNodes; i++) {
      var item = rawNodes[i];
      var name = item.entity_name || item.name || item.id;
      if (name && !addedNodeNames.has(name)) {
        nodes.push({ 
          name: name, 
          value: item.rank || Math.round((item.pagerank || 0.1) * 100) || 10, 
          isCenter: false 
        });
        addedNodeNames.add(name);
        links.push({ source: kbName, target: name });
      }
    }
  }

  if (Array.isArray(rawEdges)) {
    for (var j = 0; j < rawEdges.length; j++) {
      var edge = rawEdges[j];
      var src = edge.source || edge.src_id;
      var tgt = edge.target || edge.tgt_id;
      if (src && tgt && addedNodeNames.has(src) && addedNodeNames.has(tgt) && src !== kbName && tgt !== kbName) {
        links.push({ source: src, target: tgt });
      }
    }
  }

  return { 
    nodes: nodes, 
    links: links, 
    totalNodeCount: rawNodes.length, 
    totalEdgeCount: rawEdges.length 
  };
}

function toggleSubNodes(targetNodeName) {
  if (!window.rawRAGFlowGraph) return;
  var isExpanded = window.expandedNodeNames.has(targetNodeName);

  if (isExpanded) {
    window.expandedNodeNames.delete(targetNodeName);
    var subNodeNamesToRemove = new Set();
    for (var i = 0; i < window.activeGraphLinks.length; i++) {
      var link = window.activeGraphLinks[i];
      if (link.source === targetNodeName && link.isDynamic) {
        subNodeNamesToRemove.add(link.target);
      }
    }
    window.activeGraphNodes = window.activeGraphNodes.filter(function(node) {
      return !subNodeNamesToRemove.has(node.name);
    });
    window.activeGraphLinks = window.activeGraphLinks.filter(function(link) {
      return !(link.source === targetNodeName && link.isDynamic) && !subNodeNamesToRemove.has(link.target);
    });
  } else {
    window.expandedNodeNames.add(targetNodeName);
    var rawNodes = window.rawRAGFlowGraph.nodes || window.rawRAGFlowGraph.entities || [];
    var rawEdges = window.rawRAGFlowGraph.edges || window.rawRAGFlowGraph.links || [];
    var existingNames = new Set();
    for (var k = 0; k < window.activeGraphNodes.length; k++) {
      existingNames.add(window.activeGraphNodes[k].name);
    }
    var addedCount = 0;

    for (var m = 0; m < rawEdges.length; m++) {
      var edgeItem = rawEdges[m];
      var srcId = edgeItem.source || edgeItem.src_id;
      var tgtId = edgeItem.target || edgeItem.tgt_id;
      var subName = '';
      if (srcId === targetNodeName && !existingNames.has(tgtId)) {
        subName = tgtId;
      } else if (tgtId === targetNodeName && !existingNames.has(srcId)) {
        subName = srcId;
      }

      if (subName && addedCount < 5) {
        var subRaw = null;
        for (var n = 0; n < rawNodes.length; n++) {
          var nodeItem = rawNodes[n];
          if ((nodeItem.entity_name || nodeItem.name || nodeItem.id) === subName) {
            subRaw = nodeItem;
            break;
          }
        }
        window.activeGraphNodes.push({ 
          name: subName, 
          value: subRaw ? (subRaw.rank || 10) : 10, 
          isCenter: false, 
          isExpandedSub: true 
        });
        window.activeGraphLinks.push({ 
          source: targetNodeName, 
          target: subName, 
          isDynamic: true 
        });
        existingNames.add(subName);
        addedCount++;
      }
    }
  }
  renderArtisticGraphChart(window.activeGraphNodes, window.activeGraphLinks);
}

function renderArtisticGraphChart(nodes, links) {
  var container = document.getElementById('ragflowGraphCanvas');
  if (!container) return;
  if (!container.querySelector('canvas')) {
    container.innerHTML = '';
    initGraphCanvas();
  }

  var formattedNodes = [];
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var isCenter = node.isCenter;
    var isExpanded = window.expandedNodeNames.has(node.name);
    formattedNodes.push({
      name: node.name,
      symbolSize: isCenter ? 96 : (node.isExpandedSub ? 56 : 68),
      draggable: true,
      itemStyle: {
        color: isCenter ? '#1e293b' : '#ffffff',
        borderColor: isCenter ? '#1e293b' : (isExpanded ? '#3b82f6' : '#cbd5e1'),
        borderWidth: isCenter ? 0 : (isExpanded ? 2.5 : 1.2),
        shadowBlur: isCenter ? 18 : (isExpanded ? 8 : 4),
        shadowColor: isCenter ? 'rgba(30, 41, 59, 0.3)' : 'rgba(0, 0, 0, 0.04)'
      },
      label: {
        show: true,
        formatter: isCenter ? '{title|' + node.name + '}\n{sub|知识图谱}' : '{title|' + node.name + '} {sub|· ' + (node.value || 12) + '}',
        rich: {
          title: { 
            color: isCenter ? '#ffffff' : (isExpanded ? '#2563eb' : '#0f172a'), 
            fontSize: isCenter ? 13 : 11, 
            fontWeight: 600, 
            align: 'center', 
            lineHeight: 16 
          },
          sub: { 
            color: isCenter ? 'rgba(255,255,255,0.75)' : '#64748b', 
            fontSize: isCenter ? 9 : 10, 
            align: 'center' 
          }
        }
      }
    });
  }

  window.graphChartInstance.setOption({
    animationDurationUpdate: 600,
    animationEasingUpdate: 'cubicOut',
    series: [{
      type: 'graph',
      layout: 'force',
      data: formattedNodes,
      links: links,
      roam: true,
      center: ['50%', '50%'],
      zoom: 1.1,
      label: { position: 'inside', align: 'center' },
      force: { repulsion: 500, gravity: 0.04, edgeLength: [140, 260], layoutAnimation: true },
      lineStyle: { color: '#e2e8f0', width: 1.2, opacity: 0.6, curveness: 0.05 },
      emphasis: { focus: 'adjacency', lineStyle: { width: 2.5, color: '#3b82f6', opacity: 0.9 } }
    }]
  }, true);

  window.graphChartInstance.off('click');
  window.graphChartInstance.on('click', function(params) {
    if (params.dataType === 'node' && !params.data.isCenter) {
      toggleSubNodes(params.data.name);
    }
  });
}

function showEmptyGraphGuide(datasetId, kbName) {
  if (window.graphChartInstance) window.graphChartInstance.dispose();
  window.graphChartInstance = null;
  for (var id of ['nodeCount', 'edgeCount']) {
    var count = document.getElementById(id);
    if (count) count.textContent = '0';
  }
  var container = document.getElementById('ragflowGraphCanvas');
  if (container) {
    container.innerHTML = '<div class="d-flex flex-column align-items-center justify-content-center h-100 text-center p-4">' +
      '<i class="fas fa-project-diagram text-primary mb-3" style="font-size: 2.5rem; opacity: 0.5;"></i>' +
      '<h6 class="fw-bold text-dark mb-1">"' + escapeHtml(kbName) + '" 尚未构建知识图谱</h6>' +
      (portalIsAdmin() ? '<button class="btn btn-primary rounded-pill px-4 btn-sm mt-2" onclick="triggerBuildGraphRAG(\'' + escapeHtml(datasetId) + '\')"><i class="fas fa-play me-1"></i> 立即构建</button>' : '<div class="text-muted mt-2">请联系管理员构建图谱</div>') +
      '</div>';
  }
}

async function triggerBuildGraphRAG(datasetId) {
  try {
    var response = await fetch('/api.php?action=dataset_run_graph', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ dataset_id: datasetId }) 
    });
    var result;
    try {
      result = await response.json();
    } catch (err) {
      throw new Error('服务器返回了无效响应（HTTP ' + response.status + '）');
    }
    if (!response.ok || !result || result.code !== 0) {
      throw new Error((result && result.message) || '请求失败（HTTP ' + response.status + '）');
    }
    if (!result.data || !result.data.task_id) {
      throw new Error('服务器未返回构建任务 ID，请刷新后确认任务状态');
    }
    alert('已提交 GraphRAG 构建任务，完成后请刷新图谱。');
  } catch (err) {
    alert('图谱构建失败：' + err.message);
  }
}

function getSelectedKbName() {
  var selectEl = document.getElementById('graphKbSelect');
  return (selectEl && selectEl.selectedIndex >= 0) ? selectEl.options[selectEl.selectedIndex].text : '知识库';
}

function switchGraphByKb(datasetId) {
  if (!datasetId) return;
  window.currentGraphKbId = datasetId;
  var kbName = getSelectedKbName();
  var titleEl = document.getElementById('currentGraphKbName');
  var footerNameEl = document.getElementById('footerKbName');
  if (titleEl) titleEl.innerText = kbName;
  if (footerNameEl) footerNameEl.innerText = kbName;
  loadKnowledgeGraph(datasetId);
}

function toggleGraphFullscreen() {
  var container = document.getElementById('ragflowGraphCanvas');
  if (!container) return;
  if (!document.fullscreenElement) {
    if (container.requestFullscreen) container.requestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
  setTimeout(function() {
    if (window.graphChartInstance) window.graphChartInstance.resize();
  }, 200);
}

function previewFile(datasetId, docId, fileName, chunkText) {
  if (!docId) return alert('缺少文档 ID');
  var modalTitle = document.getElementById('previewModalTitle');
  var modalBody = document.getElementById('previewModalBody');
  var btnDownload = document.getElementById('btnDownloadFile');

  if (modalTitle) {
    modalTitle.innerHTML = '<i class="fas fa-file-alt text-primary me-2"></i>预览文档：' + escapeHtml(fileName);
  }
  var fileUrl = '/api.php?action=file_preview&dataset_id=' + encodeURIComponent(datasetId) + '&doc_id=' + encodeURIComponent(docId);
  if (btnDownload) btnDownload.href = fileUrl;

  var modalEl = document.getElementById('previewModal');
  if (!modalEl) return;
  var previewModal = null;
  if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
    previewModal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  }

  var ext = (fileName || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') {
    if (modalBody) {
      modalBody.innerHTML = '<iframe src="' + fileUrl + '" style="width: 100%; height: 100%; min-height: 600px; border: none;"></iframe>';
    }
  } else if (['txt', 'md', 'csv', 'json', 'log', 'html', 'xml'].includes(ext)) {
    if (modalBody) {
      modalBody.innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin me-2"></i>加载原文中...</div>';
    }
    fetch(fileUrl).then(function(r) { if (!r.ok) throw new Error('文件读取失败（HTTP ' + r.status + '）'); return r.text(); }).then(function(rawText) {
      if (modalBody) {
        modalBody.innerHTML = '<div style="width:100%; height:100%; min-height:600px; max-height:80vh; overflow-y:auto; background:#ffffff; padding:24px;">' +
          '<pre class="text-dark fs-6" style="white-space:pre-wrap; word-break:break-all;">' + escapeHtml(rawText) + '</pre>' +
          '</div>';
      }
    }).catch(function(err) {
      if (modalBody) {
        modalBody.innerHTML = '<div class="text-danger text-center p-5">错误: ' + escapeHtml(err.message) + '</div>';
      }
    });
  }
  if (!['pdf', 'txt', 'md', 'csv', 'json', 'log', 'html', 'xml'].includes(ext) && modalBody) {
    modalBody.innerHTML = '<div class="p-4 text-muted">此格式不支持在线预览，请点击“下载原始文件”后打开。</div>';
  }
  if (previewModal) previewModal.show();
}

window.previewFile = previewFile;
