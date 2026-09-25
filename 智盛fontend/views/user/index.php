<?php
require_once __DIR__ . '/../../auth.php';
$currentUser = checkAuth(); // 登录基础拦截
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>智盛AI综合平台 · 个人知识中心</title>
  <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet" />
  <link href="/vendor/font-awesome/css/all.min.css" rel="stylesheet" />
  <link href="/css/style.css" rel="stylesheet" />
  <script src="/vendor/echarts/echarts.min.js"></script>
  <style>
    .quick-entry .entry-item .icon i { font-size: 1.1rem; }
    .graph-section { flex: 1; min-height: 0; }
    .graph-canvas { min-height: 480px; }
    
    @media (max-width: 820px) {
      .graph-canvas { min-height: 340px; }
    }
    @media (max-width: 600px) {
      .graph-canvas { min-height: 260px; }
    }
    @media (max-width: 480px) {
      .graph-canvas { min-height: 200px; }
    }
  </style>
</head>
<body data-portal-role="<?php echo htmlspecialchars($currentUser['role'], ENT_QUOTES); ?>">
  <div class="vivarly-frame">
    <div class="view-pane">
      <?php $page = 'home'; include __DIR__ . '/../../templates/navbar.php'; ?>

      <div class="graph-section">
        <div class="graph-header">
          <div class="title-group">
            <h2><i class="fas fa-project-diagram" style="color: #3b82f6; margin-right: 8px;"></i>知识图谱 · <span id="currentGraphKbName">知识库拓扑</span></h2>
            <span class="badge bg-light text-dark border"><i class="far fa-star me-1"></i> 个人中心</span>
          </div>
          <div class="graph-actions">
            <select id="graphKbSelect" class="graph-select">
              <option value="">加载知识库中...</option>
            </select>
            <span id="btnRefreshGraph"><i class="fas fa-rotate-right"></i> 刷新</span>
            <span id="btnFullscreenGraph"><i class="fas fa-expand"></i> 全屏</span>
          </div>
        </div>

        <div class="graph-canvas" id="ragflowGraphCanvas"></div>

        <div class="d-flex justify-content-between align-items-center mt-3 text-secondary small flex-wrap" style="gap:0.3rem;">
          <div>当前知识库: <strong id="footerKbName">加载中</strong> · 共 <span id="nodeCount">0</span> 个实体, <span id="edgeCount">0</span> 条关系</div>
          <div><i class="far fa-clock me-1"></i> 实时同步</div>
        </div>
      </div>

      <div class="quick-entry">
        <div class="entry-item" onclick="window.location.href='/views/user/search.php'">
          <div class="icon"><i class="fas fa-search"></i></div>
          <div><div class="fw-bold">语义检索</div><div class="small text-muted">检索与回答</div></div>
        </div>
        <div class="entry-item" onclick="window.location.href='/views/user/chat.php'">
          <div class="icon"><i class="fas fa-comments"></i></div>
          <div><div class="fw-bold">智能对话</div><div class="small text-muted">问答与上下文</div></div>
        </div>
        <div class="entry-item" onclick="window.location.href='/views/user/dataset.php'">
          <div class="icon"><i class="fas fa-database"></i></div>
          <div><div class="fw-bold">我的知识库</div><div class="small text-muted">文档浏览与切片</div></div>
        </div>
      </div>
    </div>

    <?php include __DIR__ . '/../../templates/footer.php'; ?>
  </div>

  <script src="/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
  <script src="/js/main.js"></script>
  <script src="/js/app.js"></script>
</body>
</html>