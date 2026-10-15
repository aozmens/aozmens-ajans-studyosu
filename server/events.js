// Sunucudan tarayıcıya canlı olaylar (Server-Sent Events): job:update, job:stream, tool:update, company:update
const clients = new Set();

export function handler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

export function send(channel, payload) {
  const data = `event: ${channel}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) c.write(data);
}
