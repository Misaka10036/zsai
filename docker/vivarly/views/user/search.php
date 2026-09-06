<?php
require_once __DIR__ . '/../../auth.php';
$currentUser = checkAuth();
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VIVARILY · 检索应用</title>
  <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet" />
  <link href="/vendor/font-awesome/css/all.min.css" rel="stylesheet" />
  <link href="/css/style.css" rel="stylesheet" />
  <script src="/vendor/marked/marked.min.js"></script>
</head>
<body>
  <div class="vivarly-frame">
    <div class="view-pane">
      <?php $page = 'search'; include __DIR__ . '/../../templates/navbar.php'; ?>

      <div class="rag-hero">
        <div class="label">
          <i class="fas fa-circle"></i>
          <span>检索增强 · 基于企业知识库</span>
          <span class="ms-3 me-1 text-muted">切换搜索应用:</span>
          <select id="searchAppSelect" class="search-app-select-inline" onchange="switchSearchApp(this.value)">
            <option value="">加载搜索应用中...</option>
          </select>
        </div>

        <div class="query-bar">
          <input type="text" id="searchQueryInput" placeholder="输入问题，例如：2025年Q3销售策略..." value="如何优化产品发布流程？" onkeydown="if(event.key==='Enter') executeSearchWithApp()" />
          <button onclick="executeSearchWithApp()"><i class="fas fa-search"></i> 检索</button>
        </div>

        <div class="quick-tags">
          <span onclick="fillSearchQuery('产品发布')"><i class="fas fa-chevron-right"></i> 产品发布</span>
          <span onclick="fillSearchQuery('市场分析')"><i class="fas fa-chevron-right"></i> 市场分析</span>
          <span onclick="fillSearchQuery('竞品调研')"><i class="fas fa-chevron-right"></i> 竞品调研</span>
          <span onclick="fillSearchQuery('内部规范')"><i class="fas fa-chevron-right"></i> 内部规范</span>
        </div>
      </div>

      <div class="search-results-grid">
        <div class="ai-answer-card">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="fw-bold text-primary"><i class="far fa-check-circle me-1"></i> 基于 <span id="summaryDocCount">0</span> 篇文档生成</div>
            <span class="badge bg-light text-primary border" id="summaryDateBadge">2026-08-10</span>
          </div>
          <div id="aiSummaryBox" class="answer-content text-secondary">请输入您的提问词并点击"检索"开始问答...</div>
          <div class="answer-footer">
            <span>置信度 <strong id="confidenceVal">95%</strong></span>
            <span>引用 <strong id="sourcesCountVal">0</strong> 个来源</span>
          </div>
        </div>

        <div class="source-docs-card">
          <div class="fw-bold mb-2"><i class="fas fa-book text-primary me-1"></i> 引用文档</div>
          <div id="sourceDocsContainer"><div class="text-center text-muted py-4">暂无引用文档</div></div>
        </div>
      </div>
    </div>

    <?php include __DIR__ . '/../../templates/footer.php'; ?>
  </div>

  <?php include __DIR__ . '/../../templates/preview_modal.php'; ?>

  <script src="/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
  <script src="/js/main.js"></script>
  <script src="/js/app.js"></script>
  <script src="/js/search.js"></script>
</body>
</html>