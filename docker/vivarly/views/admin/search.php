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
    <script src="/vendor/echarts/echarts.min.js"></script>
    <!-- PDF.js 用于PDF预览和高亮定位 -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <style>
        .pdf-viewer-container {
            width: 100%;
            height: 100%;
            min-height: 600px;
            overflow: auto;
            background: #f1f4f9;
            position: relative;
        }
        .pdf-viewer-container canvas {
            display: block;
            margin: 0 auto;
            box-shadow: 0 2px 12px rgba(0,0,0,0.08);
            background: white;
        }
        .pdf-viewer-container .pdf-controls {
            position: sticky;
            top: 0;
            z-index: 10;
            background: rgba(255,255,255,0.95);
            padding: 0.5rem 1rem;
            border-bottom: 1px solid var(--border-color, #e9edf2);
            display: flex;
            align-items: center;
            gap: 0.8rem;
            flex-wrap: wrap;
        }
        .pdf-viewer-container .pdf-controls .page-info {
            font-size: 0.85rem;
            color: var(--text-muted, #64748b);
        }
        .pdf-viewer-container .pdf-controls .btn-pdf {
            padding: 0.15rem 0.8rem;
            border-radius: var(--radius-full, 9999px);
            border: 1px solid var(--border-color, #e9edf2);
            background: var(--bg-card, #ffffff);
            cursor: pointer;
            font-size: 0.75rem;
            transition: all 0.15s;
        }
        .pdf-viewer-container .pdf-controls .btn-pdf:hover {
            background: var(--bg-hover, #f1f5f9);
            border-color: #94a3b8;
        }
        .pdf-viewer-container .pdf-controls .btn-pdf.primary {
            background: var(--dark, #1e293b);
            color: var(--text-white, #f8fafc);
            border-color: var(--dark, #1e293b);
        }
        .pdf-viewer-container .pdf-controls .btn-pdf.primary:hover {
            background: var(--dark-hover, #0f172a);
        }
        .pdf-viewer-container .pdf-controls .search-highlight-info {
            font-size: 0.75rem;
            color: var(--blue, #3b82f6);
            font-weight: 500;
        }
        .pdf-viewer-container .pdf-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 400px;
            color: var(--text-muted, #64748b);
        }
        .pdf-viewer-container .pdf-loading i {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            color: var(--blue, #3b82f6);
        }
        .text-highlight {
            background: #fcd34d !important;
            padding: 0.05rem 0.15rem !important;
            border-radius: 3px !important;
            font-weight: 600 !important;
            box-shadow: 0 0 0 2px #fbbf24 !important;
        }
        .text-highlight.flash {
            animation: previewFlash 2s ease;
        }
        @keyframes previewFlash {
            0% { background: #fcd34d; box-shadow: 0 0 0 4px #fbbf24, 0 0 30px rgba(251, 191, 36, 0.3); transform: scale(1.02); }
            30% { background: #fbbf24; box-shadow: 0 0 0 6px #f59e0b, 0 0 50px rgba(251, 191, 36, 0.5); transform: scale(1.05); }
            70% { background: #fcd34d; box-shadow: 0 0 0 3px #fbbf24, 0 0 20px rgba(251, 191, 36, 0.2); transform: scale(1.02); }
            100% { background: #fcd34d; box-shadow: 0 0 0 2px #fbbf24; transform: scale(1); }
        }
        .pdf-page-container {
            position: relative;
            margin-bottom: 0.5rem;
        }
        .pdf-page-container .page-label {
            text-align: center;
            font-size: 0.7rem;
            color: var(--text-light, #94a3b8);
            padding: 0.2rem 0;
        }
        .pdf-text-layer {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            overflow: hidden;
            pointer-events: none;
            opacity: 0.2;
            line-height: 1;
        }
        .pdf-text-layer span {
            color: transparent;
            position: absolute;
            white-space: pre;
            cursor: text;
            transform-origin: 0% 0%;
        }
    </style>
</head>
<body>
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
                <h6 class="modal-title fw-bold"><i class="fas fa-plus-circle text-primary me-2"></i>新建搜索应用</h6>
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
            <div class="modal-footer">
                <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal">取消</button>
                <button type="button" class="btn btn-dark rounded-pill px-3" onclick="confirmCreateApp()"><i class="fas fa-check me-1"></i>创建</button>
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