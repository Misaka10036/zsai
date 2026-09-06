<?php
require_once __DIR__ . '/../../auth.php';
$currentUser = checkAdmin();
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VIVARILY · 知识库管理后台</title>
    <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet" />
    <link href="/vendor/font-awesome/css/all.min.css" rel="stylesheet" />
    <link href="/css/style.css" rel="stylesheet" />
    <style>
        .stat-card .actions-dropdown { position: relative; }
        .stat-card .dropdown-menu { min-width: 140px; }
        .file-table .file-name { max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .file-table .status-badge { font-size: 0.65rem; padding: 0.1rem 0.5rem; }
        .upload-zone {
            border: 2px dashed var(--border-color, #e2e8f0);
            border-radius: 1rem;
            padding: 2rem;
            text-align: center;
            cursor: pointer;
            transition: all var(--transition, 0.2s ease);
            background: var(--bg-panel, #f8fafc);
        }
        .upload-zone:hover, .upload-zone.dragover {
            border-color: var(--blue, #3b82f6);
            background: var(--bg-active, #eef2ff);
        }
        .upload-zone i { font-size: 2.5rem; color: var(--text-light, #94a3b8); }
        .upload-zone .text { margin-top: 0.5rem; color: var(--text-muted, #64748b); }
        .upload-progress { display: none; margin-top: 0.5rem; }
        .upload-progress .progress-bar { transition: width 0.3s ease; }
        .file-filter-bar { display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; padding: 0.5rem 1rem; background: #fafcfe; border-bottom: 1px solid var(--border-color, #e9edf2); }
        .file-filter-bar select, .file-filter-bar input { border-radius: var(--radius-full, 9999px); font-size: 0.75rem; padding: 0.2rem 0.8rem; border: 1px solid var(--border-light, #e2e8f0); background: var(--bg-card, #ffffff); outline: none; }
        .file-filter-bar select:focus, .file-filter-bar input:focus { border-color: var(--border-focus, #3b82f6); box-shadow: var(--shadow-focus, 0 0 0 3px rgba(59,130,246,0.12)); }
        .file-filter-bar .filter-label { font-size: 0.7rem; color: var(--text-muted, #64748b); }
        .btn-action-sm { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: var(--radius-full, 9999px); }
        .session-item .actions { opacity: 0; transition: opacity var(--transition, 0.2s ease); }
        .session-item:hover .actions { opacity: 1; }
        .modal-xl-custom { max-width: 90vw; }
        .chunk-method-badge { font-size: 0.6rem; padding: 0.05rem 0.4rem; border-radius: var(--radius-full, 9999px); }
        .parse-progress { width: 80px; height: 4px; background: #e9edf2; border-radius: 4px; overflow: hidden; display: inline-block; vertical-align: middle; }
        .parse-progress .bar { height: 100%; background: var(--blue, #3b82f6); border-radius: 4px; transition: width 0.5s ease; }
        .dataset-actions { display: flex; gap: 0.3rem; margin-top: 0.3rem; }
        .dataset-actions .badge { cursor: pointer; font-size: 0.6rem; }
        .dataset-actions .badge:hover { opacity: 0.7; }
        .btn-action-sm { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: var(--radius-full, 9999px); }
        .text-nowrap { white-space: nowrap; }
    </style>
</head>
<body>
<div class="vivarly-frame">
    <div class="view-pane">
        <?php $page = 'dataset'; include PROJECT_ROOT . '/templates/navbar.php'; ?>

        <div class="kb-header">
            <div class="title-section">
                <h1><i class="fas fa-database text-primary me-2"></i>知识库管理面板</h1>
                <span class="badge bg-primary text-white"><i class="fas fa-shield-alt me-1"></i> 管理员全视口</span>
            </div>
            <div class="actions">
                <span data-bs-toggle="modal" data-bs-target="#createDatasetModal"><i class="fas fa-plus me-1"></i> 新建知识库</span>
                <span onclick="fetchDatasets()"><i class="fas fa-rotate me-1"></i> 刷新</span>
            </div>
        </div>

        <div class="kb-stats" id="datasetListContainer">
            <div class="col-12 text-center text-muted py-4">正在加载知识库...</div>
        </div>

        <div class="kb-content" id="fileManagementSection" style="display: none;">
            <div class="file-filter-bar">
                <span class="filter-label"><i class="fas fa-filter me-1"></i>筛选:</span>
                <select id="filterRunStatus" class="form-select-sm" style="width:120px;">
                    <option value="">全部状态</option>
                    <option value="UNSTART">未解析</option>
                    <option value="RUNNING">解析中</option>
                    <option value="DONE">解析完成</option>
                    <option value="FAIL">解析失败</option>
                    <option value="CANCEL">已取消</option>
                </select>
                <select id="filterSuffix" class="form-select-sm" style="width:100px;">
                    <option value="">全部格式</option>
                    <option value="pdf">PDF</option>
                    <option value="doc">DOC</option>
                    <option value="docx">DOCX</option>
                    <option value="txt">TXT</option>
                    <option value="md">MD</option>
                    <option value="xls">XLS</option>
                    <option value="xlsx">XLSX</option>
                    <option value="ppt">PPT</option>
                    <option value="pptx">PPTX</option>
                </select>
                <input type="text" id="filterKeywords" placeholder="搜索文件名..." style="flex:1; min-width:120px;">
                <button class="btn btn-dark btn-sm rounded-pill px-3" onclick="applyFilters()"><i class="fas fa-search me-1"></i>筛选</button>
                <button class="btn btn-light btn-sm rounded-pill px-3 border" onclick="resetFilters()"><i class="fas fa-undo me-1"></i>重置</button>
                <span style="flex:1;"></span>
                <span id="btnParseSelected" class="btn btn-success btn-sm rounded-pill px-3" onclick="parseSelectedFiles()"><i class="fas fa-play me-1"></i>解析选中</span>
                <span id="btnDeleteSelected" class="btn btn-danger btn-sm rounded-pill px-3" onclick="deleteSelectedFiles()"><i class="fas fa-trash me-1"></i>删除选中</span>
            </div>

            <div class="file-table-wrap">
                <table class="file-table">
                    <thead>
                    <tr>
                        <th style="width: 3%;"><input type="checkbox" id="selectAllFiles" onchange="toggleSelectAll()"></th>
                        <th style="width: 30%;">文件名/路径</th>
                        <th style="width: 8%;">大小</th>
                        <th style="width: 10%;">可用状态</th>
                        <th style="width: 12%;">解析状态</th>
                        <th style="width: 8%;">切片数</th>
                        <th style="width: 12%;">创建时间</th>
                        <th style="width: 17%;">操作</th>
                    </tr>
                    </thead>
                    <tbody id="fileTableBody">
                    <tr><td colspan="8" class="text-center text-muted py-4">请选择知识库</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <div id="paginationInfo">共 0 条</div>
                <div id="paginationContainer"></div>
            </div>
        </div>
    </div>
    <?php include PROJECT_ROOT . '/templates/footer.php'; ?>
</div>

<?php include PROJECT_ROOT . '/templates/create_dataset_modal.php'; ?>
<?php include PROJECT_ROOT . '/templates/preview_modal.php'; ?>

<!-- 上传文件模态框 -->
<div class="modal fade" id="uploadFileModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content border-0 rounded-4 shadow">
            <div class="modal-header">
                <h5 class="modal-title fw-bold"><i class="fas fa-upload text-primary me-2"></i>上传文件到知识库</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <div id="uploadZone" class="upload-zone">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <div class="text">拖拽文件到此处，或点击选择文件</div>
                    <div class="text-muted small">支持 PDF、DOC、DOCX、TXT、MD、XLS、XLSX、PPT、PPTX 等格式</div>
                    <input type="file" id="fileInput" multiple style="display:none;" accept=".pdf,.doc,.docx,.txt,.md,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp">
                </div>
                <div id="uploadProgress" class="upload-progress">
                    <div class="d-flex justify-content-between mb-1">
                        <span id="uploadStatusText" class="small">正在上传...</span>
                        <span id="uploadPercentText" class="small">0%</span>
                    </div>
                    <div class="progress" style="height:6px;">
                        <div id="uploadProgressBar" class="progress-bar" style="width:0%;"></div>
                    </div>
                </div>
                <div id="uploadedFileList" class="mt-3" style="display:none;">
                    <div class="fw-bold small text-muted mb-2">已选文件：</div>
                    <ul id="selectedFilesList" class="list-unstyled small"></ul>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">取消</button>
                <button type="button" class="btn btn-dark rounded-pill px-4" id="btnConfirmUpload"><i class="fas fa-check me-1"></i>确认上传</button>
            </div>
        </div>
    </div>
</div>

<!-- 编辑文档模态框 -->
<div class="modal fade" id="editDocumentModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content border-0 rounded-4 shadow">
            <div class="modal-header">
                <h5 class="modal-title fw-bold"><i class="fas fa-edit text-primary me-2"></i>编辑文档配置</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <input type="hidden" id="editDocDatasetId">
                <input type="hidden" id="editDocId">
                <div class="mb-3">
                    <label class="form-label fw-semibold small">文档名称</label>
                    <input type="text" id="editDocName" class="form-control" style="border-radius:0.75rem;">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold small">切片方法 (Chunk Method)</label>
                    <select id="editChunkMethod" class="form-select" style="border-radius:0.75rem;">
                        <option value="naive">通用 (naive)</option>
                        <option value="manual">手动 (manual)</option>
                        <option value="qa">问答 (qa)</option>
                        <option value="table">表格 (table)</option>
                        <option value="paper">论文 (paper)</option>
                        <option value="book">书籍 (book)</option>
                        <option value="laws">法律 (laws)</option>
                        <option value="presentation">演示文稿 (presentation)</option>
                        <option value="picture">图片 (picture)</option>
                        <option value="one">单一 (one)</option>
                        <option value="email">邮件 (email)</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold small">切片 Token 数</label>
                    <input type="number" id="editChunkTokenNum" class="form-control" value="128" style="border-radius:0.75rem;">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold small">布局识别</label>
                    <select id="editLayoutRecognize" class="form-select" style="border-radius:0.75rem;">
                        <option value="true">开启</option>
                        <option value="false">关闭</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold small">可用状态</label>
                    <select id="editEnabled" class="form-select" style="border-radius:0.75rem;">
                        <option value="1">启用</option>
                        <option value="0">禁用</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">取消</button>
                <button type="button" class="btn btn-dark rounded-pill px-4" id="btnConfirmEdit"><i class="fas fa-save me-1"></i>保存修改</button>
            </div>
        </div>
    </div>
</div>

<script src="/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="/js/main.js"></script>
<script src="/js/app.js"></script>
<script src="/js/dataset.js"></script>
</body>
</html>