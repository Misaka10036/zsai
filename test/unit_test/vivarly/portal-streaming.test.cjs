const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const { JSDOM } = createRequire(path.join(root, 'web/package.json'))('jsdom');
const portal = path.join(root, '智盛fontend');
const tick = () => new Promise(resolve => setImmediate(resolve));
const event = value => 'data:' + JSON.stringify(value) + '\r\n\r\n';
async function page(view, script) {
  const html = fs.readFileSync(path.join(portal, 'views', view), 'utf8').replace(/<\?php[\s\S]*?\?>/g, '');
  const dom = new JSDOM(html, { url: 'http://portal.test', runScripts: 'outside-only' });
  await new Promise(resolve => dom.window.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const w = dom.window;
  w.TextDecoder = TextDecoder;
  w.alert = () => {};
  for (const file of ['main.js', script]) w.eval(fs.readFileSync(path.join(portal, 'js', file), 'utf8'));
  return dom;
}
function transport(w) {
  let controller;
  const body = new ReadableStream({ start(c) { controller = c; } });
  const requests = [];
  w.fetch = async (url, options) => {
    requests.push({ url, data: JSON.parse(options.body) });
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } });
  };
  return {
    requests,
    write(text) { // Force even UTF-8 codepoints and CRLF boundaries to cross network chunks.
      for (const byte of new TextEncoder().encode(text)) controller.enqueue(Uint8Array.of(byte));
    },
    close() { controller.close(); }
  };
}
async function chatStream() {
  const dom = await page('user/chat.php', 'chat.js');
  const w = dom.window;
  w.currentChatId = 'chat'; w.currentSessionId = 'session';
  const io = transport(w);
  const input = w.document.getElementById('chatInputMessage');
  const messages = w.document.getElementById('chatMessageStream');
  input.value = 'question';
  let finished = false;
  const sending = w.sendChatMessage().then(() => { finished = true; });
  io.write(': heartbeat\r\n\r\n' + event({ code: 0, data: { start_to_think: true } }) +
    event({ code: 0, data: { answer: '思考' } }) + event({ code: 0, data: { end_to_think: true } }) +
    event({ code: 0, data: { answer: '你好' } }));
  await tick();
  assert.match(messages.textContent, /你好/);
  assert.match(messages.querySelector('details').textContent, /思考/);
  assert.equal(finished, false, 'Must render before completion');
  io.write(event({ code: 0, data: { answer: '世界<script>bad()</script>' } }) +
    event({ code: 0, data: { final: true, answer: '', reference: { chunks: [{ doc_id: 'doc', kb_id: 'kb', docnm_kwd: 'source.pdf' }] } } }));
  await tick();
  assert.match(messages.textContent, /你好世界/);
  assert.match(messages.textContent, /source.pdf/);
  assert.equal(messages.querySelector('script'), null);
  io.write(event({ code: 0, data: true }));
  await sending;
  assert.equal(io.requests[0].data.stream, true);
  assert.equal(messages.querySelectorAll('.message.bot').length, 1);
  assert.doesNotMatch(messages.textContent, /回答失败/);

  const broken = transport(w);
  input.value = 'retry';
  const interrupted = w.sendChatMessage();
  broken.write(event({ code: 0, data: { answer: 'partial answer' } }));
  broken.close();
  await interrupted;
  assert.match(messages.textContent, /partial answer/);
  assert.match(messages.textContent, /连接中断/);
  assert.equal(input.value, 'retry');
  const switching = transport(w);
  input.value = 'old turn';
  const oldTurn = w.sendChatMessage();
  switching.write(event({ code: 0, data: { answer: 'old partial' } }));
  await tick();
  w.portalRequest = async () => ({ messages: [{ role: 'assistant', content: 'new session history' }] });
  await w.switchSession('new');
  switching.write(event({ code: 0, data: { final: true, answer: 'old final' } }) + event({ code: 0, data: true }));
  await oldTurn;
  assert.match(messages.textContent, /new session history/);
  assert.doesNotMatch(messages.textContent, /old partial|old final/);
  const final = transport(w);
  input.value = 'full final';
  const finalTurn = w.sendChatMessage();
  final.write(event({ code: 0, data: { answer: 'prefix' } }) + event({ code: 0, data: { final: true, answer: 'prefix suffix' } }) + event({ code: 0, data: true }));
  await finalTurn;
  assert.match(messages.textContent, /prefix suffix/);
  assert.doesNotMatch(messages.textContent, /prefixprefix/);
  dom.window.close();
}
async function parserErrors() {
  const dom = await page('user/chat.php', 'chat.js');
  const w = dom.window;
  for (const [raw, error] of [
    ['data:{bad}\n\n', /格式错误/],
    [event({ code: 500, message: 'model failed' }), /model failed/],
    [event({ event: 'error', data: { message: 'node failed' } }), /node failed/],
    ['data:{"code":0}\n', /连接中断/]
  ]) {
    const io = transport(w);
    const promise = w.portalStream('chat_send', {}, () => {});
    const check = assert.rejects(promise, error);
    io.write(raw); io.close(); await check;
  }
  w.fetch = async () => new Response(JSON.stringify({ code: 401, message: 'login required' }), { status: 401 });
  await assert.rejects(w.portalStream('chat_send', {}, () => {}), /login required/);
  dom.window.close();
}
async function agentStream() {
  const dom = await page('admin/agent.php', 'agent.js');
  const w = dom.window;
  w.currentAgentId = 'agent'; w.currentSessionId = 'session'; w.agentReady = true;
  w.prompt = () => 'question';
  const io = transport(w);
  const running = w.startAgent();
  io.write(event({ event: 'node_started', data: { component_id: 'llm' } }) +
    event({ event: 'message', data: { content: '第一段' } }));
  await tick();
  const log = w.document.getElementById('logBody');
  assert.match(log.textContent, /第一段/);
  assert.equal(w.isRunning, true);
  assert.doesNotMatch(log.textContent, /任务执行完成/);
  io.write(event({ event: 'message', data: { content: '第二段' } }) +
    event({ event: 'message_end', data: {} }) + event({ event: 'node_finished', data: { component_id: 'llm' } }) +
    event({ event: 'workflow_finished', data: { usage: {} } }) + 'data:[DONE]\n\n');
  await running;
  assert.match(log.textContent, /第一段第二段/);
  assert.match(log.textContent, /任务执行完成/);
  assert.equal(w.currentSessionId, 'session');
  assert.equal(io.requests[0].data.stream, true);
  const broken = transport(w);
  const failed = w.startAgent();
  broken.write(event({ event: 'message', data: { content: '保留部分输出' } }));
  broken.close();
  await failed;
  assert.match(log.textContent, /保留部分输出/);
  assert.match(log.textContent, /运行失败.*连接中断/);
  assert.doesNotMatch(log.textContent, /任务执行完成/);
  const cancelled = transport(w);
  w.portalRequest = async (action, data) => {
    assert.equal(action, 'agent_cancel');
    assert.equal(data.session_id, 'session');
    return true;
  };
  const cancelRun = w.startAgent();
  cancelled.write(event({ event: 'message', data: { content: '取消前' } }));
  await tick();
  await w.stopAgent();
  assert.equal(w.isRunning, true, 'Cancel must wait for the stream to finish');
  cancelled.write(event({ event: 'message', data: { content: '取消后不显示' } }) + 'data:[DONE]\n\n');
  await cancelRun;
  assert.equal(w.currentSessionId, null);
  assert.match(log.textContent, /取消前/);
  assert.doesNotMatch(log.textContent, /取消后不显示|任务执行完成/);
  dom.window.close();
}
(async () => {
  for (const test of [chatStream, parserErrors, agentStream]) {
    await test(); console.log('PASS ' + test.name);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
