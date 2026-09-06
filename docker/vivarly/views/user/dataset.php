<?php
require_once __DIR__ . '/../../auth.php';
$currentUser = checkAuth();
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VIVARILY · 我的知识库</title>
  <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet" />
  <link href="/vendor/font-awesome/css/all.min.css" rel="stylesheet" />
  <link href="/css/style.css" rel="stylesheet" />
</head>
<body>
  <div class="vivarly-frame">
    <div class="view-pane">
      <?php $page = 'dataset'; include __DIR__ . '/../../templates/navbar.php'; ?>

      <div class="kb-header">
        <div class="title-section">
          <h1><i class="fas fa-database text-primary me-2"></i>我的知识库</h1>
          <span class="badge bg-light text-dark border"><i class="far fa-folder-open me-1"></i> 文档知识</span>
        </div>
        <div class="actions">
          <span data-bs-toggle="modal" data-bs-target="#createDatasetModal"><i class="fas fa-plus me-1"></i> 新建</span>
          <span onclick="fetchDatasets()"><i class="fas fa-rotate me-1"></i> 刷新</span>
        </div>
      </div>

      <div class="kb-stats" id="datasetListContainer">
        <div class="col-12 text-center text-muted py-4">正在加载知识库...</div>
      </div>

      <div class="kb-content" id="fileManagementSection" style="display: none;">
        <div class="file-table-wrap">
          <table class="file-table">
            <thead>
              <tr>
                <th style="width: 32%;">文件名/路径</th>
                <th style="width: 10%;">大小</th>
                <th style="width: 12%;">可用状态</th>
                <th style="width: 12%;">解析状态</th>
                <th style="width: 10%;">切片数</th>
                <th style="width: 14%;">创建时间</th>
                <th style="width: 10%;">操作</th>
              </tr>
            </thead>
            <tbody id="fileTableBody">
              <tr><td colspan="7" class="text-center text-muted py-4">请选择知识库</td></tr>
            </tbody>
          </table>
        </div>

        <div class="table-footer">
          <div id="paginationInfo">共 0 条</div>
          <div id="paginationContainer"></div>
        </div>
      </div>
    </div>

    <?php include __DIR__ . '/../../templates/footer.php'; ?>
  </div>

  <?php include __DIR__ . '/../../templates/create_dataset_modal.php'; ?>
  <?php include __DIR__ . '/../../templates/preview_modal.php'; ?>

  <script src="/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
  <script src="/js/main.js"></script>
  <script src="/js/app.js"></script>
  <script src="/js/dataset.js"></script>
</body>
</html>