// 本地 mock：OpenAI 兼容的 /chat/completions SSE 流式响应（仅用于离线联调验证）
import http from 'node:http';

const CHUNKS = [
  '你好！',
  '这是',
  '一段',
  ' **流式** ',
  '测试',
  '。\n\n',
  '```js\n',
  'console.log("hello pi-web");\n',
  '```\n',
];

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.includes('/chat/completions')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(200, {
        'cache-control': 'no-cache',
        'content-type': 'text/event-stream',
      });
      let i = 0;
      const timer = setInterval(() => {
        if (i >= CHUNKS.length) {
          res.write(
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], created: Date.now(), id: 'mock', model: 'mock', object: 'chat.completion.chunk' })}\n\n`,
          );
          res.write('data: [DONE]\n\n');
          res.end();
          clearInterval(timer);
          return;
        }
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: CHUNKS[i] }, index: 0 }], created: Date.now(), id: 'mock', model: 'mock', object: 'chat.completion.chunk' })}\n\n`,
        );
        i++;
      }, 150);
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(9123, () => console.log('mock llm on http://localhost:9123/v1'));
