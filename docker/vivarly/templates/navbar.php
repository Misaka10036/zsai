<?php 
require_once __DIR__ . '/../auth.php';
$currentUser = getCurrentUser();
$page = $page ?? 'home'; 
$isAdminView = strpos($_SERVER['REQUEST_URI'] ?? '', '/views/admin/') !== false;
$basePath = ($currentUser['role'] ?? '') === 'admin' ? '/views/admin' : '/views/user';
?>
<nav class="navbar">
  <div class="logo-area" onclick="window.location.href='<?php echo $basePath; ?>/index.php'">
    <div class="brand-icon">V</div>
    <div class="brand-name">VIVARILY <span>· <?php echo $isAdminView ? '管理后台' : '知识引擎'; ?></span></div>
  </div>
  <div class="nav-links">
    <a href="<?php echo $basePath; ?>/index.php" class="<?php echo $page === 'home' ? 'active' : ''; ?>"><i class="fas fa-project-diagram"></i> 首页</a>
    <a href="<?php echo $basePath; ?>/dataset.php" class="<?php echo $page === 'dataset' ? 'active' : ''; ?>"><i class="fas fa-database"></i> 知识库</a>
    <a href="<?php echo $basePath; ?>/search.php" class="<?php echo $page === 'search' ? 'active' : ''; ?>"><i class="fas fa-search"></i> 搜索</a>
    <a href="<?php echo $basePath; ?>/chat.php" class="<?php echo $page === 'chat' ? 'active' : ''; ?>"><i class="fas fa-comment-dots"></i> 对话</a>
    
    <?php if (($currentUser['role'] ?? '') === 'admin'): ?>
      <a href="/views/admin/users.php" class="<?php echo $page === 'users' ? 'active' : ''; ?>"><i class="fas fa-users-cog"></i> 用户管理</a>
      <a href="/views/admin/files.php" class="<?php echo $page === 'files' ? 'active' : ''; ?>"><i class="fas fa-folder-open"></i> 文件管理</a>
      <a href="<?php echo $basePath; ?>/agent.php" class="<?php echo $page === 'agent' ? 'active' : ''; ?>"><i class="fas fa-robot"></i> Agent</a>
    <?php endif; ?>
    <?php if ($currentUser): ?>
      <div class="dropdown d-inline-block">
        <button class="primary-btn dropdown-toggle border-0" type="button" data-bs-toggle="dropdown" aria-expanded="false">
          <i class="fas fa-user-circle me-1"></i><?php echo htmlspecialchars($currentUser['real_name'] ?: $currentUser['username']); ?>
          <span class="badge bg-light text-dark ms-1" style="font-size:0.6rem; padding:0.1rem 0.4rem;"><?php echo $currentUser['role'] === 'admin' ? '管理员' : '普通用户'; ?></span>
        </button>
        <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 rounded-3 mt-2">
          <?php if ($currentUser['role'] === 'admin'): ?>
            <li><a class="dropdown-item py-2" href="/views/admin/index.php"><i class="fas fa-shield-alt me-2 text-primary"></i>切换到管理端</a></li>
            <li><a class="dropdown-item py-2" href="/views/user/index.php"><i class="fas fa-user me-2 text-secondary"></i>切换到用户端</a></li>
            <li><hr class="dropdown-divider"></li>
          <?php endif; ?>
          <li><a class="dropdown-item text-danger py-2" href="javascript:void(0)" onclick="doLogout()"><i class="fas fa-sign-out-alt me-2"></i>退出登录</a></li>
        </ul>
      </div>
    <?php else: ?>
      <a href="/views/login.php" class="primary-btn"><i class="fas fa-key"></i> 登录</a>
    <?php endif; ?>
  </div>
</nav>

<script>
function doLogout() {
  fetch('/api.php?action=logout').then(function() {
    window.location.href = '/views/login.php';
  }).catch(function() {
    window.location.href = '/views/login.php';
  });
}
</script>