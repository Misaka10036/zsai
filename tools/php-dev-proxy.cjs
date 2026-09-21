// Local PHP development proxy. Cancellation has its own PHP worker so long
// completions cannot queue it behind the request it needs to stop.
const http = require('node:http');

function createPortalProxy(ports, cancelPort) {
  const active = ports.map(() => 0);
  return http.createServer((request, response) => {
    const action = new URL(request.url, 'http://localhost').searchParams.get('action');
    const cancel = action === 'agent_cancel';
    const index = active.indexOf(Math.min(...active));
    if (!cancel) active[index]++;
    let released = false;
    const release = () => {
      if (!released && !cancel) active[index]--;
      released = true;
    };
    const upstream = http.request({
      hostname: '127.0.0.1', port: cancel ? cancelPort : ports[index],
      method: request.method, path: request.url,
      headers: { ...request.headers, connection: 'close' },
    }, incoming => {
      response.writeHead(incoming.statusCode, incoming.headers);
      incoming.pipe(response);
      incoming.on('end', release);
      incoming.on('error', error => response.destroy(error));
    });
    upstream.setTimeout(310000, () => upstream.destroy(new Error('PHP request timed out')));
    upstream.on('error', () => {
      release();
      if (!response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ code: 502, message: 'PHP 服务不可用或请求超时，请检查启动日志' }));
      } else response.destroy();
    });
    response.on('close', () => { release(); upstream.destroy(); });
    request.on('error', () => upstream.destroy());
    request.pipe(upstream);
  });
}

if (require.main === module) {
  const [port, cancelPort, ...ports] = process.argv.slice(2).map(Number);
  if (!ports.length || [port, cancelPort, ...ports].some(value => !Number.isInteger(value) || value < 1 || value > 65535)) {
    throw new Error('Usage: node php-dev-proxy.cjs PORT CANCEL_PORT WORKER_PORT [WORKER_PORT]');
  }
  createPortalProxy(ports, cancelPort).listen(port, '127.0.0.1', () => console.log(`Portal: http://127.0.0.1:${port}`));
}

module.exports = { createPortalProxy };
