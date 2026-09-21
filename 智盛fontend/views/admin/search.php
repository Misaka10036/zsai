<?php
require_once __DIR__ . '/../../auth.php';
$currentUser = checkAdmin();
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VIVARILY · 搜索应用管理</title>
    <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet" />
    <link href="/vendor/font-awesome/css/all.min.css" rel="stylesheet" />
    <link href="/css/style.css" rel="stylesheet" />
    <script src="/vendor/marked/marked.min.js"></script>
  <script src="/vendor/dompurify/purify.min.js"></script>
    <script src="/vendor/echarts/echarts.min.js"></script>
    <!-- PDF.js 用于PDF预览和高亮定位 -->
    <script src="/vendor/pdfjs/pdf.min.js"></script>
</head>
<body data-portal-role="<?php echo htmlspecialchars($currentUser['role'], ENT_QUOTES); ?>">
<div class="vivarly-frame">
    <div class="view-pane">
        <?php $page = 'search'; include PROJECT_ROOT . '/templates/navbar.php'; ?>

        <div class="search-manager">

            <!-- ===== 左侧：搜索应用列表 ===== -->
            <div class="search-sidebar">
                <div class="sidebar-header">
                    <span class="title"><i class="fas fa-search me-1"></i>搜索应用</span>
                    <button class="btn-new-app" onclick="showCreateAppModal()"><i class="fas fa-plus"></i> 新建</button>
                </div>
                <div class="search-app-list" id="searchAppList">
                    <div class="text-center text-muted py-3 small"><i class="fas fa-spinner fa-spin me-1"></i>加载中...</div>
                </div>
            </div>

            <!-- ===== 右侧：搜索测试与结果 ===== -->
            <div class="search-main">
                <!-- 搜索测试区 -->
                <div class="search-test-area" id="searchTestArea">
                    <div class="test-label">
                        <i class="fas fa-circle"></i>
                        <span>检索测试 · 当前应用: <strong id="currentAppNameDisplay">未选择</strong></span>
                    </div>
                    <div class="query-row">
                        <input type="text" id="searchQueryInput" placeholder="输入问题，例如：如何优化产品发布流程？" onkeydown="if(event.key==='Enter') executeSearch()" />
                        <button onclick="executeSearch()"><i class="fas fa-search"></i> 检索</button>
                    </div>
                    <div class="quick-tags">
                        <span onclick="fillSearchQuery('产品发布')"><i class="fas fa-chevron-right"></i> 产品发布</span>
                        <span onclick="fillSearchQuery('市场分析')"><i class="fas fa-chevron-right"></i> 市场分析</span>
                        <span onclick="fillSearchQuery('竞品调研')"><i class="fas fa-chevron-right"></i> 竞品调研</span>
                        <span onclick="fillSearchQuery('内部规范')"><i class="fas fa-chevron-right"></i> 内部规范</span>
                    </div>
                </div>

                <!-- 搜索结果 -->
                <div class="search-results-area" id="searchResultsArea">
                    <div class="empty-state">
                        <i class="fas fa-search"></i>
                        <div class="title">选择应用开始检索</div>
                        <div class="desc">左侧选择一个搜索应用，然后输入问题</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <?php include PROJECT_ROOT . '/templates/footer.php'; ?>
</div>

<!-- ===== 新建搜索应用模态框 ===== -->
<div class="modal fade" id="createAppModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-sm">
        <div class="modal-content border-0 rounded-4 shadow">
            <div class="modal-header">
                <h6 id="searchConfigTitle" class="modal-title fw-bold"><i class="fas fa-plus-circle text-primary me-2"></i>新建搜索应用</h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <label class="form-label small fw-semibold">应用名称 <span class="text-danger">*</span></label>
                    <input type="text" id="newAppName" class="form-control" placeholder="例如：工艺检索" style="border-radius:0.75rem;">
                </div>
                <div class="mb-2">
                    <label class="form-label small fw-semibold">描述</label>
                    <textarea id="newAppDesc" class="form-control" rows="2" placeholder="简要描述..." style="border-radius:0.75rem;"></textarea>
                </div>
            </div>
            <div class="px-3 pb-3">
                <label for="searchDatasetIds" class="form-label">关联知识库（可多选）</label>
                <select id="searchDatasetIds" class="form-select" multiple size="5"></select>
                <div id="searchConfigError" class="text-danger small mt-2" role="alert"></div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal">取消</button>
                <button type="button" class="btn btn-dark rounded-pill px-3" id="saveSearchApp" onclick="confirmCreateApp()"><i class="fas fa-check me-1"></i>创建</button>
            </div>
        </div>
    </div>
</div>

<!-- ===== 预览模态框 ===== -->
<?php include PROJECT_ROOT . '/templates/preview_modal.php'; ?>

<script src="/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="/js/main.js"></script>
<script src="/js/app.js"></script>
<script src="/js/search.js"></script>
</body>
</html>