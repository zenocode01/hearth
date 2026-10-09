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
  'console.log("hello hearth");\n',
  '```\n',
];

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.includes('/chat/completions')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let parsed = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        /* 忽略：按流式走 */
      }

      // 非流式（AI SDK 的 generateText 走这条路，上下文压缩的摘要就靠它）：
      // 只回 SSE 会让 provider 解析失败，所以这里必须给一份标准 JSON。
      // 注意：generateText 请求里往往**不带 stream 字段**（undefined），不是 stream:false，
      // 所以判定要用 `!== true`（缺省/false 都当非流式），否则会漏判、仍回 SSE。
      if (parsed && parsed.stream !== true) {
        const lastUser = [...(parsed.messages ?? [])]
          .reverse()
          .find((m) => m.role === 'user');
        const text = String(lastUser?.content ?? '')
          .replace(/\s+/g, ' ')
          .slice(0, 120);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                index: 0,
                message: { content: `[mock 摘要] ${text}`, role: 'assistant' },
              },
            ],
            created: Date.now(),
            id: 'mock',
            model: 'mock',
            object: 'chat.completion',
            usage: { completion_tokens: 32, prompt_tokens: 64, total_tokens: 96 },
          }),
        );
        return;
      }

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
