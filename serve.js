// 极简静态文件服务（Windows/WSL 通用）
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const PORT = Number(process.env.PORT || 8322);
const MIME = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

const toSlash = p => p.replace(/\\/g, '/');
const rootSlash = toSlash(ROOT);

http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  // join（非 resolve）：urlPath 带前导 /，resolve 会当成绝对路径
  const f = toSlash(path.join(ROOT, urlPath));
  if (f !== rootSlash && !f.startsWith(rootSlash + '/')) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(f, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('not found: ' + urlPath);
    }
    const ext = path.extname(f).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}`);
});
