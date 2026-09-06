/**
 * VIVARILY · 对话管理专用逻辑
 * 版本: 2.0 (适配新UI样式)
 */

window.currentChatId = '';
window.currentSessionId = '';
window.chatApps = [];

document.addEventListener('DOMContentLoaded', function() {
  initChatApps();

  var btnNewSession = document.getElementById('btnCreateNewSession');
  if (btnNewSession) btnNewSession.addEventListener('click', createNewChatSession);

  var btnRefresh = document.getElementById('btnRefreshChat');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', function() {
      if (window.currentChatId) loadAppSessions(window.currentChatId);
    });
  }

  var appSelector = document.getElementById('chatAppSelector');
  if (appSelector) {
    appSelector.addEventListener('change', function() {
      if (this.value) switchChatApp(this.value);
    });
  }

  var inputEl = document.getElementById('chatInputMessage');
  if (inputEl) {
    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }
});

async function initChatApps() {
  var appSelector = document.getElementById('chatAppSelector');
  if (!appSelector) return;

  try {
    var res = await fetch('/api.php?action=chat_app_list&page_size=50').then(function(r) { return r.json(); });
    var apps = [];
    if (res.code === 0 || res.code === 200) {
      apps = res.data?.chats || res.data?.list || (Array.isArray(res.data) ? res.data : []);
    }

    window.chatApps = apps;
    if (apps.length === 0) {
      appSelector.innerHTML = '<option value="">RAGFlow 中无现成聊天应用</option>';
      return;
    }

    var optionsHtml = '';
    for (var i = 0; i < apps.length; i++) {
      var app = apps[i];
      optionsHtml += '<option value="' + escapeHtml(app.id) + '">' + escapeHtml(app.name || app.id) + '</option>';
    }
    appSelector.innerHTML = optionsHtml;
    appSelector.value = apps[0].id;
    switchChatApp(apps[0].id);
  } catch (err) {
    console.error('加载应用列表失败:', err);
  }
}

function switchChatApp(chatId) {
  if (!chatId) return;
  window.currentChatId = chatId;
  window.currentSessionId = '';

  var app = null;
  for (var i = 0; i < window.chatApps.length; i++) {
    if (window.chatApps[i].id === chatId) {
      app = window.chatApps[i];
      break;
    }
  }
  var appNameEl = document.getElementById('currentAppName');
  if (appNameEl) appNameEl.innerText = app ? (app.name || app.id) : '已选择';

  var inputEl = document.getElementById('chatInputMessage');
  if (inputEl) {
    inputEl.disabled = false;
    inputEl.placeholder = '输入你的问题，按 Enter 发送...';
  }

  updateAppInfo(app);
  loadAppSessions(chatId);
}

function updateAppInfo(app) {
  var infoEl = document.getElementById('appInfoContainer');
  if (!infoEl) return;

  if (!app) {
    infoEl.innerHTML = '<div class="text-muted text-center py-2 small">未选择应用</div>';
    return;
  }

  infoEl.innerHTML = 
    '<div style="display:flex; justify-content:space-between; padding:3px 0; font-size:0.75rem; border-bottom:1px solid #eef2f6;">' +
      '<span style="color:#64748b;">应用名称</span>' +
      '<span style="font-weight:600; color:#0f172a;">' + escapeHtml(app.name || app.id) + '</span>' +
    '</div>' +
    '<div style="display:flex; justify-content:space-between; padding:3px 0; font-size:0.75rem; border-bottom:1px solid #eef2f6;">' +
      '<span style="color:#64748b;">模型</span>' +
      '<span style="font-weight:500; color:#0f172a;">' + escapeHtml(app.llm_id || '默认') + '</span>' +
    '</div>';
}

async function loadAppSessions(chatId) {
  var container = document.getElementById('chatSessionList');
  if (!container) return;

  container.innerHTML = '<div class="text-center text-muted py-3 small"><i class="fas fa-spinner fa-spin me-1"></i>读取对话中...</div>';

  try {
    var res = await fetch('/api.php?action=chat_session_list&chat_id=' + chatId).then(function(r) { return r.json(); });
    var sessions = res.data || [];

    if (sessions.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-4 small">暂无您发起的对话</div>';
      renderMessages([]);
      return;
    }

    var html = '';
    for (var i = 0; i < sessions.length; i++) {
      var sess = sessions[i];
      var isActive = sess.id === window.currentSessionId;
      html += '<div class="session-item' + (isActive ? ' active' : '') + '" onclick="switchSession(\'' + sess.id + '\')">';
      html += '  <div class="info">';
      html += '    <div class="name">' + escapeHtml(sess.name || '新对话') + '</div>';
      html += '  </div>';
      html += '  <div class="actions">';
      html += '    <button title="删除" onclick="event.stopPropagation(); deleteSession(\'' + sess.id + '\')">';
      html += '      <i class="fas fa-trash-alt"></i>';
      html += '    </button>';
      html += '  </div>';
      html += '</div>';
    }
    container.innerHTML = html;

    if (!window.currentSessionId && sessions.length > 0) {
      switchSession(sessions[0].id);
    }
  } catch (err) {
    container.innerHTML = '<div class="text-danger text-center py-3 small">读取对话失败</div>';
  }
}

function switchSession(sessionId) {
  window.currentSessionId = sessionId;
  var items = document.querySelectorAll('#chatSessionList .session-item');
  for (var i = 0; i < items.length; i++) {
    var el = items[i];
    var onclickAttr = el.getAttribute('onclick') || '';
    if (onclickAttr.indexOf(sessionId) !== -1) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }
  fetchSessionMessages(sessionId);
}

async function fetchSessionMessages(sessionId) {
  var chatStream = document.getElementById('chatMessageStream');
  if (!chatStream) return;

  chatStream.innerHTML = '<div class="text-center text-muted py-4"><i class="fas fa-spinner fa-spin me-1"></i>调取历史对话记录...</div>';

  try {
    var res = await fetch('/api.php?action=chat_session_detail&chat_id=' + window.currentChatId + '&session_id=' + sessionId).then(function(r) { return r.json(); });
    
    var rawMessages = res.data?.messages || res.data?.history || [];
    var formattedMessages = [];

    if (Array.isArray(rawMessages)) {
      for (var i = 0; i < rawMessages.length; i++) {
        var item = rawMessages[i];
        if (item.role && item.content) {
          formattedMessages.push({
            role: item.role === 'assistant' ? 'bot' : item.role,
            content: item.content
          });
        } else if (item.question || item.answer) {
          if (item.question) formattedMessages.push({ role: 'user', content: item.question });
          if (item.answer) formattedMessages.push({ role: 'bot', content: item.answer });
        }
      }
    }

    renderMessages(formattedMessages);
  } catch (e) {
    renderMessages([]);
  }
}

function renderMessages(messages) {
  var chatStream = document.getElementById('chatMessageStream');
  if (!chatStream) return;

  if (messages.length === 0) {
    chatStream.innerHTML = '<div class="text-center text-muted py-4 small">暂无历史消息，请输入问题发起对话</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    var isUser = msg.role === 'user';
    var content = msg.content || '';
    if (typeof cleanThinkProcess === 'function') {
      content = cleanThinkProcess(content);
    }
    var parsedContent = (typeof marked !== 'undefined' && marked.parse) ? marked.parse(content) : escapeHtml(content);

    html += '<div class="message ' + (isUser ? 'user' : 'bot') + '">';
    html += '  <div class="msg-avatar ' + (isUser ? 'user-av' : 'bot') + '">' + (isUser ? 'U' : 'V') + '</div>';
    html += '  <div><div class="bubble">' + parsedContent + '</div></div>';
    html += '</div>';
  }
  chatStream.innerHTML = html;
  chatStream.scrollTop = chatStream.scrollHeight;
}

async function createNewChatSession() {
  if (!window.currentChatId) return alert('请先选择一个聊天应用');
  var name = prompt('请输入对话标题:', '新对话');
  if (!name || !name.trim()) return;

  var res = await fetch('/api.php?action=chat_session_create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: window.currentChatId, name: name.trim() })
  }).then(function(r) { return r.json(); });

  if (res.code === 0 || res.code === 200) {
    window.currentSessionId = res.data.id;
    loadAppSessions(window.currentChatId);
  } else {
    alert('创建对话失败: ' + (res.message || '未知错误'));
  }
}

async function deleteSession(sessionId) {
  if (!confirm('确定删除该对话吗？（将同步在 RAGFlow 中彻底删除）')) return;

  var res = await fetch('/api.php?action=chat_session_delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: window.currentChatId, session_id: sessionId })
  }).then(function(r) { return r.json(); });

  if (res.code === 0 || res.code === 200) {
    if (window.currentSessionId === sessionId) window.currentSessionId = '';
    loadAppSessions(window.currentChatId);
  } else {
    alert('删除失败: ' + (res.message || '未知错误'));
  }
}

async function sendChatMessage() {
  var inputEl = document.getElementById('chatInputMessage');
  var question = inputEl.value.trim();
  if (!question || !window.currentChatId) return;

  if (!window.currentSessionId) {
    alert('请先新建或选择一个对话');
    return;
  }

  var chatStream = document.getElementById('chatMessageStream');
  chatStream.insertAdjacentHTML('beforeend', 
    '<div class="message user">' +
      '<div class="msg-avatar user-av">U</div>' +
      '<div><div class="bubble">' + escapeHtml(question) + '</div></div>' +
    '</div>' +
    '<div class="message bot" id="loadingMsg">' +
      '<div class="msg-avatar bot">V</div>' +
      '<div><div class="bubble"><i class="fas fa-spinner fa-spin text-primary me-2"></i>思考中...</div></div>' +
    '</div>'
  );
  
  inputEl.value = '';
  chatStream.scrollTop = chatStream.scrollHeight;

  try {
    var res = await fetch('/api.php?action=chat_send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: window.currentChatId,
        session_id: window.currentSessionId,
        question: question
      })
    }).then(function(r) { return r.json(); });

    var loadingMsg = document.getElementById('loadingMsg');
    if (loadingMsg) loadingMsg.remove();

    var answer = '';
    if (res.code === 0 || res.code === 200) {
      if (typeof res.data === 'string') {
        answer = res.data;
      } else if (res.data?.answer) {
        answer = res.data.answer;
      } else if (res.data?.content) {
        answer = res.data.content;
      } else if (res.data?.response) {
        answer = res.data.response;
      }
    } else if (res.message) {
      answer = '请求出错: ' + res.message;
    }

    if (!answer) {
      answer = '未能从 RAGFlow 获取回答，请检查模型配置。';
    }

    if (typeof cleanThinkProcess === 'function') answer = cleanThinkProcess(answer);

    var parsedAnswer = (typeof marked !== 'undefined' && marked.parse) ? marked.parse(answer) : escapeHtml(answer);

    chatStream.insertAdjacentHTML('beforeend',
      '<div class="message bot">' +
        '<div class="msg-avatar bot">V</div>' +
        '<div><div class="bubble">' + parsedAnswer + '</div></div>' +
      '</div>'
    );
    chatStream.scrollTop = chatStream.scrollHeight;
  } catch (e) {
    var loadingMsg2 = document.getElementById('loadingMsg');
    if (loadingMsg2) loadingMsg2.remove();
    alert('通信异常: ' + e.message);
  }
}