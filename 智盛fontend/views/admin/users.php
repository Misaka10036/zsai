<?php
require_once __DIR__ . '/../../auth.php';
$currentUser = checkAdmin();
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VIVARILY · 用户账号管理</title>
  <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet" />
  <link href="/vendor/font-awesome/css/all.min.css" rel="stylesheet" />
  <link href="/css/style.css" rel="stylesheet" />
  <style>
    /* 用户管理专用微调 */
    .file-table td .btn-sm { font-size: 0.7rem; padding: 0.1rem 0.5rem; }
    .file-table td .btn-sm i { font-size: 0.65rem; }
  </style>
</head>
<body data-portal-role="<?php echo htmlspecialchars($currentUser['role'], ENT_QUOTES); ?>">
  <div class="vivarly-frame">
    <div class="view-pane">
      <?php $page = 'users'; include PROJECT_ROOT . '/templates/navbar.php'; ?>

      <div class="kb-header">
        <div class="title-section">
          <h1><i class="fas fa-users-cog text-primary me-2"></i>用户管理</h1>
          <span class="badge bg-light text-dark border"><i class="fas fa-shield-alt me-1"></i> 系统权限控制</span>
        </div>
        <div class="actions">
          <span data-bs-toggle="modal" data-bs-target="#createUserModal"><i class="fas fa-user-plus me-1"></i> 新增用户</span>
          <span onclick="loadUserList()"><i class="fas fa-rotate me-1"></i> 刷新</span>
        </div>
      </div>

      <div class="kb-content">
        <div class="file-table-wrap">
          <table class="file-table">
            <thead>
              <tr>
                <th style="width: 6%;">ID</th>
                <th style="width: 16%;">用户名</th>
                <th style="width: 20%;">电子邮箱</th>
                <th style="width: 14%;">真实姓名</th>
                <th style="width: 12%;">角色</th>
                <th style="width: 10%;">状态</th>
                <th style="width: 22%;">操作</th>
              </tr>
            </thead>
            <tbody id="userTableBody">
              <tr><td colspan="7" class="text-center text-muted py-4">读取数据中...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <?php include PROJECT_ROOT . '/templates/footer.php'; ?>
  </div>

  <!-- 创建用户模态框 -->
  <div class="modal fade" id="createUserModal" tabindex="-1">
    <div class="modal-dialog">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header">
          <h5 class="modal-title fw-bold"><i class="fas fa-user-plus text-primary me-2"></i>新增用户</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3"><label class="form-label fw-semibold small">用户名 <span class="text-danger">*</span></label><input type="text" id="newUsername" class="form-control"></div>
          <div class="mb-3"><label class="form-label fw-semibold small">电子邮件</label><input type="email" id="newEmail" class="form-control"></div>
          <div class="mb-3"><label class="form-label fw-semibold small">初始密码 <span class="text-danger">*</span></label><input type="password" id="newPassword" class="form-control"></div>
          <div class="mb-3"><label class="form-label fw-semibold small">真实姓名</label><input type="text" id="newRealName" class="form-control"></div>
          <div class="mb-3">
            <label class="form-label fw-semibold small">角色</label>
            <select id="newRole" class="form-select">
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-dark rounded-pill px-4" onclick="submitCreateUser()"><i class="fas fa-check me-1"></i>提交创建</button>
        </div>
      </div>
    </div>
  </div>

  <script src="/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
  <script src="/js/main.js"></script>
  <script>
    document.addEventListener('DOMContentLoaded', loadUserList);

    async function loadUserList() {
      const tbody = document.getElementById('userTableBody');
      try {
        const list = await portalList('user_list', ['list']);
        {
          tbody.innerHTML = list.map(u => `
            <tr>
              <td>${u.id}</td>
              <td class="fw-bold">${escapeHtml(u.username)}</td>
              <td>${escapeHtml(u.email || '-')}</td>
              <td>${escapeHtml(u.real_name || '-')}</td>
              <td><span class="badge ${u.role === 'admin' ? 'bg-primary' : 'bg-secondary'}">${u.role === 'admin' ? '管理员' : '普通用户'}</span></td>
              <td><span class="badge ${u.status == 1 ? 'bg-success-subtle text-success border' : 'bg-danger-subtle text-danger border'}">${u.status == 1 ? '启用' : '禁用'}</span></td>
              <td>
                <button class="btn btn-sm btn-light border me-1" onclick="toggleStatus(${u.id}, ${u.status == 1 ? 0 : 1})">${u.status == 1 ? '禁用' : '启用'}</button>
                <button class="btn btn-sm btn-light text-danger border" onclick="deleteUser(${u.id})"><i class="fas fa-trash-alt me-1"></i>删除</button>
              </td>
            </tr>
          `).join('');
        }
      } catch(e) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">加载失败: ${escapeHtml(e.message)}</td></tr>`;
      }
    }

    async function submitCreateUser() {
      const username = document.getElementById('newUsername').value.trim();
      const email = document.getElementById('newEmail').value.trim();
      const password = document.getElementById('newPassword').value.trim();
      const real_name = document.getElementById('newRealName').value.trim();
      const role = document.getElementById('newRole').value;

      if (!username || !password) return alert('用户名和初始密码为必填项');

      const res = await fetch('/api.php?action=user_create', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ username, email, password, real_name, role })
      }).then(r => r.json());

      if (res.code === 0) {
        bootstrap.Modal.getInstance(document.getElementById('createUserModal')).hide();
        loadUserList();
      } else { alert(res.message); }
    }

    async function toggleStatus(id, status) {
      try { await portalRequest('user_update', { id, status }); await loadUserList(); }
      catch (error) { alert('更新失败：' + error.message); }
    }

    async function deleteUser(id) {
      if (!confirm('确定要删除该用户账号吗？')) return;
      try { await portalRequest('user_delete', { id }); await loadUserList(); }
      catch (error) { alert('删除失败：' + error.message); }
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  </script>
</body>
</html>