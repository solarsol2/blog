/**
 * 의존성 없는 경량 서버 (Node 18+).
 * - 정적 파일 서빙
 * - POST /api/generate : 폼 데이터 → 프롬프트 조립 → Claude API 호출
 * ANTHROPIC_API_KEY가 없으면 /api/health가 ready:false를 반환해 프론트가 데모 모드로 동작한다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { validate, buildPrompt, buildRefinePrompt } = require('./js/prompt.js');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml' };

const sendJSON = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 200_000) reject(new Error('요청이 너무 큽니다.')); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('잘못된 JSON')); } });
  });
}

async function callClaude({ system, user }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096, system, messages: [{ role: 'user', content: user }] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Claude API 오류 (${res.status})`);
  return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function handleGenerate(req, res) {
  if (!API_KEY) return sendJSON(res, 503, { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' });
  try {
    const { form = {}, previousText } = await readBody(req);
    const errors = validate(form);
    if (errors.length) return sendJSON(res, 400, { error: errors[0] });
    const prompt = previousText ? buildRefinePrompt(form, previousText) : buildPrompt(form);
    sendJSON(res, 200, { text: await callClaude(prompt) });
  } catch (err) {
    sendJSON(res, 500, { error: err.message });
  }
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(ROOT) || !['.html', '.js', '.css', '.svg'].includes(path.extname(file)) || file === __filename) {
    res.writeHead(404); return res.end('Not found');
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  if (req.url === '/api/health') return sendJSON(res, 200, { ready: Boolean(API_KEY), model: MODEL });
  if (req.url === '/api/generate' && req.method === 'POST') return handleGenerate(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, () => console.log(`▶ http://localhost:${PORT}  (${API_KEY ? `LLM: ${MODEL}` : '데모 모드: ANTHROPIC_API_KEY 없음'})`));
