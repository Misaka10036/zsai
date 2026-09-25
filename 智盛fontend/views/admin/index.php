<?php
require_once __DIR__ . '/../../auth.php';
$currentUser = checkAdmin();
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>智盛AI综合平台 · 管理员控制台</title>
  <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet" />
  <link href="/vendor/font-awesome/css/all.min.css" rel="stylesheet" />
  <link href="/css/style.css" rel="stylesheet" />
  <script src="/vendor/echarts/echarts.min.js"></script>
  <style>
    /* 首页专用微调 */
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
      <?php $page = 'home'; include PROJECT_ROOT . '/templates/navbar.php'; ?>

      <!-- 图谱区域 - 使用 flex:1 撑满 -->
      <div class="graph-section">
        <div class="graph-header">
          <div class="title-group">
            <h2><i class="fas fa-shield-alt text-primary me-2"></i>全域知识拓扑 · 管理端 <span id="currentGraphKbName" class="text-muted" style="font-size:0.85rem;font-weight:400;">全域知识库</span></h2>
            <span class="badge bg-primary text-white"><i class="fas fa-cog me-1"></i>系统管理员权限</span>
          </div>
          <div class="graph-actions">
            <select id="graphKbSelect" class="graph-select">
              <option value="">加载知识库中...</option>
            </select>
            <span id="btnRefreshGraph"><i class="fas fa-rotate-right"></i> 刷新</span>
            <span id="btnFullscreenGraph"><i class="fas fa-expand"></i> 全屏</span>
          </div>
        </div>

        <!-- 图谱画布 - 高度自适应 -->
        <div class="graph-canvas" id="ragflowGraphCanvas"></div>

        <!-- 底部统计信息 -->
        <div class="d-flex justify-content-between align-items-center mt-3 text-secondary small flex-wrap" style="gap:0.3rem; flex-shrink: 0;">
          <div>当前知识库: <strong id="footerKbName">加载中</strong> · 共 <span id="nodeCount">0</span> 个实体, <span id="edgeCount">0</span> 条关系</div>
          <div><i class="far fa-clock me-1"></i> 管理员实时监控</div>
        </div>
      </div>

      <!-- 快速入口 -->
      <div class="quick-entry">
        <div class="entry-item" onclick="window.location.href='/views/admin/users.php'">
          <div class="icon"><i class="fas fa-users-cog"></i></div>
          <div><div class="fw-bold">用户管理</div><div class="small text-muted">权限与账号配置</div></div>
        </div>
        <div class="entry-item" onclick="window.location.href='/views/admin/dataset.php'">
          <div class="icon"><i class="fas fa-database"></i></div>
          <div><div class="fw-bold">知识库管理</div><div class="small text-muted">全域文档与解析</div></div>
        </div>
        <div class="entry-item" onclick="window.location.href='/views/admin/search.php'">
          <div class="icon"><i class="fas fa-search"></i></div>
          <div><div class="fw-bold">检索测试</div><div class="small text-muted">向量+关键词测试</div></div>
        </div>
        <div class="entry-item" onclick="window.location.href='/views/admin/chat.php'">
          <div class="icon"><i class="fas fa-comments"></i></div>
          <div><div class="fw-bold">助手对话</div><div class="small text-muted">模型对话测试</div></div>
        </div>
      </div>
    </div>

    <?php include PROJECT_ROOT . '/templates/footer.php'; ?>
  </div>

  <script src="/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
  <script src="/js/main.js"></script>
  <script src="/js/app.js"></script>
</body>
</html>