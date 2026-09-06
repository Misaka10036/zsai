<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VIVARILY · 用户登录与注册</title>
  <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet" />
  <link href="/vendor/font-awesome/css/all.min.css" rel="stylesheet" />
  <link href="/css/style.css" rel="stylesheet" />
  <style>
    .auth-card { width: 400px; border-radius: 1.2rem; }
    .nav-pills .nav-link { color: #64748b; font-weight: 600; border-radius: 30px; padding: 0.4rem 1.2rem; }
    .nav-pills .nav-link.active { background-color: #0f172a; color: #ffffff; }
  </style>
</head>
<body class="d-flex align-items-center justify-content-center min-vh-100 bg-light">
  <div class="card border-0 shadow-lg auth-card p-4">
    <div class="text-center mb-3">
      <div class="brand-icon mx-auto mb-2" style="width: 52px; height: 52px; font-size: 1.6rem; background: #0f172a; color: #ffffff; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 700;">V</div>
      <h4 class="fw-bold text-dark mt-2 mb-1">VIVARILY 知识引擎</h4>
      <p class="text-muted small">欢迎体验企业级智能问答与检索</p>
    </div>

    <ul class="nav nav-pills nav-justified mb-4 bg-light p-1 rounded-pill" id="authTab" role="tablist">
      <li class="nav-item" role="presentation">
        <button class="nav-link active" id="login-tab" data-bs-toggle="pill" data-bs-target="#login-panel" type="button" role="tab">登 录</button>
      </li>
      <li class="nav-item" role="presentation">
        <button class="nav-link" id="register-tab" data-bs-toggle="pill" data-bs-target="#register-panel" type="button" role="tab">注 册</button>
      </li>
    </ul>

    <div class="tab-content" id="authTabContent">
      <!-- 登录面板 -->
      <div class="tab-pane fade show active" id="login-panel" role="tabpanel">
        <div class="mb-3">
          <label class="form-label small fw-semibold text-secondary">用户名或电子邮件</label>
          <input type="text" id="loginAccount" class="form-control rounded-3" placeholder="admin 或 user@domain.com" value="admin">
        </div>
        <div class="mb-4">
          <label class="form-label small fw-semibold text-secondary">密码</label>
          <input type="password" id="loginPassword" class="form-control rounded-3" placeholder="请输入密码" value="admin123" onkeydown="if(event.key==='Enter') doLogin()">
        </div>
        <button class="btn btn-primary rounded-pill w-100 py-2 fw-semibold" onclick="doLogin()">立即登录</button>
      </div>

      <!-- 注册面板 -->
      <div class="tab-pane fade" id="register-panel" role="tabpanel">
        <div class="mb-3">
          <label class="form-label small fw-semibold text-secondary">电子邮件 <span class="text-danger">*</span></label>
          <input type="email" id="regEmail" class="form-control rounded-3" placeholder="user@domain.com">
        </div>
        <div class="mb-3">
          <label class="form-label small fw-semibold text-secondary">自定义密码 <span class="text-danger">*</span></label>
          <input type="password" id="regPassword" class="form-control rounded-3" placeholder="至少 6 位密码">
        </div>
        <div class="mb-3">
          <label class="form-label small fw-semibold text-secondary">确认密码 <span class="text-danger">*</span></label>
          <input type="password" id="regConfirmPassword" class="form-control rounded-3" placeholder="再次输入密码">
        </div>
        <div class="mb-4">
          <label class="form-label small fw-semibold text-secondary">真实姓名 / 昵称 (选填)</label>
          <input type="text" id="regRealName" class="form-control rounded-3" placeholder="如：张三">
        </div>
        <button class="btn btn-dark rounded-pill w-100 py-2 fw-semibold" onclick="doRegister()">注 册 账 号</button>
      </div>
    </div>
  </div>

  <script src="/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
  <script>
    async function doLogin() {
      const account = document.getElementById('loginAccount').value.trim();
      const password = document.getElementById('loginPassword').value.trim();
      
      if (!account || !password) {
        alert('请填写完整的账号或邮箱与密码');
        return;
      }

      try {
        const response = await fetch('/api.php?action=login', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ account, password })
        });
        const res = await response.json();

        if (res.code === 0) {
          // 根据后端返回的角色进行角色化目录路由拆分
          const role = res.data?.role || 'user';
          if (role === 'admin') {
            window.location.href = '/views/admin/index.php';
          } else {
            window.location.href = '/views/user/index.php';
          }
        } else {
          alert(res.message || '登录失败');
        }
      } catch (e) {
        alert('网络通信异常: ' + e.message);
      }
    }

    async function doRegister() {
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value.trim();
      const confirmPassword = document.getElementById('regConfirmPassword').value.trim();
      const realName = document.getElementById('regRealName').value.trim();

      if (!email) return alert('请输入有效的电子邮件！');
      if (!password || password.length < 6) return alert('密码不能少于 6 位！');
      if (password !== confirmPassword) return alert('两次输入的密码不一致！');

      try {
        const response = await fetch('/api.php?action=register', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ email, password, real_name: realName })
        });
        const res = await response.json();

        if (res.code === 0) {
          alert('注册成功！已为您填入登录账号，请进行登录。');
          document.getElementById('loginAccount').value = email;
          document.getElementById('loginPassword').value = password;
          const loginTab = new bootstrap.Tab(document.getElementById('login-tab'));
          loginTab.show();
        } else {
          alert(res.message || '注册失败');
        }
      } catch (e) {
        alert('注册异常: ' + e.message);
      }
    }
  </script>
</body>
</html>