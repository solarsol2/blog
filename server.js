/**
 * 의존성 없는 경량 서버 (Node 18+).
 * - 정적 파일 서빙(허용 목록만)
 * - POST /api/generate : 폼 데이터 → 프롬프트 조립 → Claude API 호출
 * API 키는 서버에만 있고 브라우저로 내려가지 않으며, 요청/응답 내용은 기록하지 않는다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { validate, buildPrompt, buildRevisePrompt } = require('./js/prompt.js');

// .env 파일이 있으면 환경변수로 등록 (이미 설정된 값이 우선)
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* .env 없음 */ }

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // 기본은 내 컴퓨터에서만 접속 가능
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';
const MAX_BODY = 64 * 1024;

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/js/prompt.js': ['js/prompt.js', 'text/javascript; charset=utf-8'],
  '/js/api.js': ['js/api.js', 'text/javascript; charset=utf-8'],
  '/js/app.js': ['js/app.js', 'text/javascript; charset=utf-8'],
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too_large')); req.removeAllListeners('data'); req.resume(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

async function callClaude({ system, user }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4096, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    // 상세 응답은 클라이언트로 보내지 않음 (키·계정 정보 노출 방지)
    const reason = { 401: 'API 키가 올바르지 않습니다.', 429: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' }[res.status];
    throw new Error(reason || `LLM 호출에 실패했습니다. (${res.status})`);
  }
  const data = await res.json();
  return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function handleGenerate(req, res) {
  if (!API_KEY) return send(res, 503, { error: 'API 키가 설정되지 않았습니다.' });
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: '잘못된 요청입니다.' });
  try {
    const { form = {}, previousText, feedback } = await readBody(req);
    const errors = validate(form);
    if (errors.length) return send(res, 400, { error: errors[0] });
    const prompt = previousText ? buildRevisePrompt(form, String(previousText).slice(0, 20000), feedback) : buildPrompt(form);
    send(res, 200, { text: await callClaude(prompt) });
  } catch (err) {
    const known = { too_large: [413, '요청이 너무 큽니다.'], bad_json: [400, '잘못된 요청입니다.'] }[err.message];
    if (known) return send(res, known[0], { error: known[1] });
    send(res, 502, { error: err.name === 'TimeoutError' ? '응답 시간이 초과되었습니다.' : err.message });
  }
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api/health') return send(res, 200, { ready: Boolean(API_KEY) });
  if (pathname === '/api/generate' && req.method === 'POST') return handleGenerate(req, res);
  const file = req.method === 'GET' && STATIC[pathname];
  if (!file) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
  fs.readFile(path.join(__dirname, file[0]), (err, buf) => (err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, buf, file[1])));
}).listen(PORT, HOST, () => console.log(`▶ http://${HOST}:${PORT} (${API_KEY ? 'LLM 연결' : '데모 모드'})`));
