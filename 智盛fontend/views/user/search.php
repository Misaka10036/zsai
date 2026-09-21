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
  <script src="/vendor/dompurify/purify.min.js"></script>
<script src="/vendor/echarts/echarts.min.js"></script>
<script src="/vendor/pdfjs/pdf.min.js"></script>
</head>
<body data-portal-role="<?php echo htmlspecialchars($currentUser['role'], ENT_QUOTES); ?>">
  <div class="vivarly-frame">
    <div class="view-pane">
      <?php $page = 'search'; include __DIR__ . '/../../templates/navbar.php'; ?>

      <div class="rag-hero">
        <div class="label">
          <i class="fas fa-circle"></i>
          <span>检索增强 · 基于企业知识库</span>
          <span class="ms-3 me-1 text-muted">切换搜索应用:</span>
          <select id="searchAppSelect" class="search-app-select-inline" onchange="selectApp(this.value)">
            <option value="">加载搜索应用中...</option>
          </select>
        </div>

        <div class="query-bar">
          <input type="text" id="searchQueryInput" placeholder="输入问题，例如：2025年Q3销售策略..." value="如何优化产品发布流程？" onkeydown="if(event.key==='Enter') executeSearch()" />
          <button onclick="executeSearch()"><i class="fas fa-search"></i> 检索</button>
        </div>

        <div class="quick-tags">
          <span onclick="fillSearchQuery('产品发布')"><i class="fas fa-chevron-right"></i> 产品发布</span>
          <span onclick="fillSearchQuery('市场分析')"><i class="fas fa-chevron-right"></i> 市场分析</span>
          <span onclick="fillSearchQuery('竞品调研')"><i class="fas fa-chevron-right"></i> 竞品调研</span>
          <span onclick="fillSearchQuery('内部规范')"><i class="fas fa-chevron-right"></i> 内部规范</span>
        </div>
      </div>

      <div id="searchResultsArea" class="mt-3"></div>
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