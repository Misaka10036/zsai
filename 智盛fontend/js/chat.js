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

var chatViewVersion = 0;
var chatListVersion = 0;
var chatHistoryVersion = 0;
var chatPending = new Set();
var creatingChatSession = false;

function currentChatView(chatId, sessionId, version) {
  return window.currentChatId === chatId && window.currentSessionId === sessionId && chatViewVersion === version;
}

async function initChatApps() {
  var selector = document.getElementById('chatAppSelector');
  if (!selector) return;
  try {
    window.chatApps = await portalList('chat_app_list', ['chats', 'list']);
    selector.replaceChildren(...window.chatApps.map(app => new Option(app.name || app.id, app.id)));
    if (!window.chatApps.length) {
      selector.replaceChildren(new Option('暂无聊天应用，请联系管理员配置', ''));
      return;
    }
    switchChatApp(window.chatApps[0].id);
  } catch (error) {
    selector.replaceChildren(new Option('加载失败：' + error.message, ''));
  }
}

function switchChatApp(chatId) {
  if (!chatId) return;
  chatViewVersion++;
  chatHistoryVersion++;
  window.currentChatId = chatId;
  window.currentSessionId = '';
  renderMessages([]);
  var app = window.chatApps.find(app => app.id === chatId);
  var name = document.getElementById('currentAppName');
  if (name) name.textContent = app?.name || chatId;
  var input = document.getElementById('chatInputMessage');
  if (input) input.disabled = false;
  var info = document.getElementById('appInfoContainer');
  if (info) info.textContent = '应用：' + (app?.name || chatId) + ' · 模型：' + (app?.llm_id || '默认');
  loadAppSessions(chatId);
}

async function loadAppSessions(chatId) {
  var container = document.getElementById('chatSessionList');
  if (!container) return;
  var version = ++chatListVersion;
  container.textContent = '读取对话中...';
  try {
    var sessions = await portalRequest('chat_session_list&chat_id=' + encodeURIComponent(chatId));
    if (version !== chatListVersion || window.currentChatId !== chatId) return;
    if (!Array.isArray(sessions)) throw new Error('会话列表格式无效');
    container.replaceChildren();
    for (var session of sessions) {
      var row = document.createElement('div');
      row.className = 'session-item' + (session.id === window.currentSessionId ? ' active' : '');
      row.dataset.id = session.id;
      var title = document.createElement('span');
      title.textContent = session.name || '新对话';
      row.appendChild(title);
      var remove = document.createElement('button');
      remove.textContent = '删除';
      remove.onclick = (id => event => { event.stopPropagation(); deleteSession(id); })(session.id);
      row.appendChild(remove);
      row.onclick = (id => () => switchSession(id))(session.id);
      container.appendChild(row);
    }
    if (!sessions.some(session => session.id === window.currentSessionId)) {
      if (sessions.length) switchSession(sessions[0].id);
      else { window.currentSessionId = ''; chatViewVersion++; renderMessages([]); }
    }
    if (!sessions.length) container.textContent = '暂无对话，请新建';
  } catch (error) {
    if (version === chatListVersion && window.currentChatId === chatId) container.textContent = '读取对话失败：' + error.message;
  }
}

function switchSession(sessionId) {
  window.currentSessionId = sessionId;
  chatViewVersion++;
  document.querySelectorAll('#chatSessionList .session-item').forEach(row => row.classList.toggle('active', row.dataset.id === sessionId));
  renderMessages([]);
  return fetchSessionMessages(sessionId);
}

async function fetchSessionMessages(sessionId) {
  var stream = document.getElementById('chatMessageStream');
  if (!stream) return;
  var chatId = window.currentChatId;
  var version = chatViewVersion;
  var historyVersion = ++chatHistoryVersion;
  stream.textContent = '读取历史消息...';
  try {
    var data = await portalRequest('chat_session_detail&chat_id=' + encodeURIComponent(chatId) + '&session_id=' + encodeURIComponent(sessionId));
    if (!currentChatView(chatId, sessionId, version) || historyVersion !== chatHistoryVersion) return;
    var references = data.reference || [];
    var referenceIndex = 0;
    var sawQuestion = false;
    var messages = (data.messages || []).map(function(message) {
      if (message.role === 'user') sawQuestion = true;
      var reference = message.reference;
      if (message.role === 'assistant' && sawQuestion) {
        reference = reference || (Array.isArray(references) ? references[referenceIndex++] : references[message.id]);
      }
      return { role: message.role, content: message.content, reference: reference };
    });
    renderMessages(messages);
  } catch (error) {
    if (currentChatView(chatId, sessionId, version) && historyVersion === chatHistoryVersion) stream.textContent = '读取历史失败：' + error.message;
  }
}

function chatMessageHTML(message) {
  var isUser = message.role === 'user';
  var content = String(message.content || '');
  return '<div class="message ' + (isUser ? 'user' : 'bot') + '"><div class="msg-avatar ' + (isUser ? 'user-av' : 'bot') + '">' +
    (isUser ? 'U' : 'V') + '</div><div><div class="bubble">' + renderSafeMarkdown(content) +
    (isUser ? '' : renderChatReferences(message.reference)) + '</div></div></div>';
}

function renderMessages(messages) {
  var stream = document.getElementById('chatMessageStream');
  if (!stream) return;
  stream.innerHTML = messages.length ? messages.map(chatMessageHTML).join('') : '<div class="text-muted p-3">暂无历史消息，请输入问题发起对话</div>';
  stream.scrollTop = stream.scrollHeight;
}

async function createNewChatSession() {
  if (creatingChatSession) return;
  var chatId = window.currentChatId;
  if (!chatId) return alert('请先选择聊天应用');
  var name = prompt('请输入对话标题:', '新对话');
  if (!name?.trim()) return;
  var version = chatViewVersion;
  creatingChatSession = true;
  try {
    var data = await portalRequest('chat_session_create', { chat_id: chatId, name: name.trim() });
    if (!data?.id) throw new Error('未返回会话 ID');
    if (window.currentChatId !== chatId || version !== chatViewVersion) return;
    await switchSession(data.id);
    await loadAppSessions(chatId);
  } catch (error) { alert('创建对话失败：' + error.message); }
  finally { creatingChatSession = false; }
}

async function deleteSession(sessionId) {
  var chatId = window.currentChatId;
  if (chatPending.has(chatId + ':' + sessionId)) return alert('该会话正在回答，请等待完成后删除');
  if (!confirm('确定删除该对话吗？')) return;
  try {
    await portalRequest('chat_session_delete', { chat_id: chatId, session_id: sessionId });
    if (window.currentChatId !== chatId) return;
    if (window.currentSessionId === sessionId) { window.currentSessionId = ''; chatViewVersion++; renderMessages([]); }
    await loadAppSessions(chatId);
  } catch (error) { alert('删除对话失败：' + error.message); }
}

async function sendChatMessage() {
  var input = document.getElementById('chatInputMessage');
  var question = input.value.trim();
  var chatId = window.currentChatId;
  var sessionId = window.currentSessionId;
  var version = chatViewVersion;
  if (!question || !chatId) return;
  if (!sessionId) return alert('请先新建或选择对话');
  var key = chatId + ':' + sessionId;
  if (chatPending.has(key)) return;
  chatPending.add(key);
  chatHistoryVersion++;
  var stream = document.getElementById('chatMessageStream');
  stream.insertAdjacentHTML('beforeend', chatMessageHTML({ role: 'user', content: question }));
  var loading = document.createElement('div');
  loading.className = 'text-muted p-3';
  loading.textContent = '思考中...';
  stream.appendChild(loading);
  input.value = '';
  var answer = '', thinking = '', reference = null, inThinking = false;
  var output = document.createElement('div');
  try {
    await portalStream('chat_send', { chat_id: chatId, session_id: sessionId, question: question }, function(event) {
      var data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.start_to_think) inThinking = true;
      if (data.end_to_think) inThinking = false;
      if (data.final) { if (typeof data.answer === 'string' && data.answer) answer = data.answer; }
      else if (inThinking) thinking += data.answer || '';
      else answer += data.answer || '';
      if (data.reference) reference = data.reference;
      if (!currentChatView(chatId, sessionId, version)) return;
      loading.remove();
      if (!output.parentNode) stream.appendChild(output);
      output.innerHTML = (thinking ? '<details><summary>思考过程</summary>' + renderSafeMarkdown(thinking) + '</details>' : '') +
        chatMessageHTML({ role: 'assistant', content: answer, reference: reference });
      stream.scrollTop = stream.scrollHeight;
    });
    if (!currentChatView(chatId, sessionId, version)) return;
    if (!answer) throw new Error('未返回回答，请检查模型配置');
  } catch (error) {
    if (currentChatView(chatId, sessionId, version)) {
      var message = document.createElement('div');
      message.className = 'text-danger p-3';
      message.textContent = '回答失败：' + error.message;
      stream.appendChild(message);
      if (!input.value) input.value = question;
    }
  } finally {
    chatPending.delete(key);
    loading.remove();
    if (currentChatView(chatId, sessionId, version)) stream.scrollTop = stream.scrollHeight;
    else if (window.currentChatId === chatId && window.currentSessionId === sessionId) fetchSessionMessages(sessionId);
  }
}
