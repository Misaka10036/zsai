<?php
require_once __DIR__ . '/../../auth.php';
$currentUser = checkAuth(); // 普通用户权限拦截
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VIVARILY · 智能对话</title>
  <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet" />
  <link href="/vendor/font-awesome/css/all.min.css" rel="stylesheet" />
  <script src="/vendor/marked/marked.min.js"></script>
  <script src="/vendor/dompurify/purify.min.js"></script>
  <link href="/css/style.css" rel="stylesheet" />
  <style>
    .chat-layout { flex: 1; min-height: 0; }
    .chat-main { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
    .chat-header, .chat-input-area { flex-shrink: 0; }
    .chat-messages {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 1rem 1.2rem 0.6rem;
      display: flex;
      flex-direction: column;
      gap: 0.8rem;
    }
  </style>
</head>
<body data-portal-role="<?php echo htmlspecialchars($currentUser['role'], ENT_QUOTES); ?>">
  <div class="vivarly-frame">
    <div class="view-pane">
      <?php $page = 'chat'; include __DIR__ . '/../../templates/navbar.php'; ?>

      <div class="chat-layout">
        <!-- 左侧：选择聊天应用与历史对话列表 -->
        <div class="chat-sidebar-left">
          <div class="mb-2">
            <label class="form-label fw-semibold small text-secondary" style="font-size:0.78rem;"><i class="fas fa-robot text-primary me-1"></i>选择聊天应用</label>
            <select id="chatAppSelector" class="form-select form-select-sm" style="border-radius: 10px; font-size: 0.78rem;">
              <option value="">加载应用中...</option>
            </select>
          </div>

          <div class="d-flex justify-content-between align-items-center pb-2 mb-2 border-bottom">
            <div class="fw-semibold text-dark small"><i class="fas fa-comments text-primary me-2"></i>我的对话</div>
            <button class="btn btn-dark btn-sm rounded-pill px-2 py-0 small" id="btnCreateNewSession" style="font-size: 0.72rem;">
              <i class="fas fa-plus me-1"></i>新建对话
            </button>
          </div>

          <div class="session-list" id="chatSessionList">
            <div class="text-center text-muted py-4 small">请选择应用</div>
          </div>
        </div>

        <!-- 中间：对话主交互面板 -->
        <div class="chat-main">
          <div class="chat-header">
            <div class="d-flex align-items-center gap-2">
              <div class="brand-icon rounded-circle" style="width:34px; height:34px; font-size:0.85rem; border-radius:50%;">V</div>
              <div>
                <div class="fw-bold text-dark" id="chatTitleName">知识助手</div>
                <div class="text-muted" style="font-size: 0.72rem;">
                  <i class="fas fa-circle text-success me-1" style="font-size:0.4rem;"></i>
                  当前应用: <span id="currentAppName">未选择</span>
                </div>
              </div>
            </div>
            <button class="btn btn-light border btn-sm rounded-pill px-3 text-secondary small" id="btnRefreshChat">
              <i class="fas fa-rotate-right me-1"></i>刷新
            </button>
          </div>

          <!-- 局域滚动消息显示区域 -->
          <div class="chat-messages" id="chatMessageStream">
            <div class="d-flex flex-column align-items-center justify-content-center h-100 text-center text-muted">
              <i class="fas fa-comments text-secondary mb-3" style="font-size: 2.5rem; opacity: 0.3;"></i>
              <h6 class="fw-bold text-dark mb-1">请选择聊天应用发起对话</h6>
              <small>选择左侧应用后即可开始聊天</small>
            </div>
          </div>

          <div class="chat-input-area">
            <div class="input-wrap">
              <textarea id="chatInputMessage" rows="1" placeholder="选择应用后输入问题，按 Enter 发送..." disabled></textarea>
            </div>
          </div>
        </div>

        <!-- 右侧：应用信息卡片 -->
        <div class="chat-sidebar-right">
          <div class="sidebar-card app-info-card">
            <div class="title"><i class="fas fa-info-circle me-1"></i>应用信息</div>
            <div id="appInfoContainer">
              <div class="text-muted text-center py-2 small">未选择应用</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <?php include __DIR__ . '/../../templates/footer.php'; ?>
  </div>

  <?php include __DIR__ . '/../../templates/preview_modal.php'; ?>

  <script src="/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
  <script src="/js/main.js"></script>
  <script src="/js/app.js"></script>
  <script src="/js/chat.js"></script>
</body>
</html>