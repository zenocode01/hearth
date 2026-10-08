import { jsonSchema, tool } from 'ai';

/**
 * 内置工具（L2-11 工具调用）：AI 能在对话中主动调用它们，结果回填给模型继续回答。
 *
 * 三个示范工具刻意选了"不需要 API key、结果确定"的：
 * - `calculate`：安全的自研表达式求值（**不用 eval**）
 * - `get_current_time`：当前时间（可指定时区）
 * - `fetch_url`：抓网页正文（去标签、截断）
 *
 * 参考 refs 的 builtin-tool-* 目录结构（每个工具一份定义 + 描述），我们保持最小实现。
 */

/** 安全求值：只支持数字、+ - * / % ( )，递归下降解析（不碰 eval / Function）。 */
export function evaluateExpression(input: string): number {
  const source = input.replaceAll(/\s+/g, '');
  if (!source) throw new Error('表达式为空');
  if (!/^[\d+\-*/%().]+$/.test(source)) {
    throw new Error('只支持数字与 + - * / % ( ) ');
  }

  let index = 0;
  const peek = () => source[index];

  const parseNumber = (): number => {
    // 一元正负号
    if (peek() === '+' || peek() === '-') {
      const sign = source[index] === '-' ? -1 : 1;
      index += 1;
      return sign * parseNumber();
    }
    if (peek() === '(') {
      index += 1;
      const value = parseSum();
      if (peek() !== ')') throw new Error('括号不匹配');
      index += 1;
      return value;
    }
    const start = index;
    while (index < source.length && /[\d.]/.test(source[index])) index += 1;
    if (start === index) throw new Error(`无法解析位置 ${index} 的内容`);
    const value = Number(source.slice(start, index));
    if (Number.isNaN(value)) throw new Error('数字格式不对');
    return value;
  };

  const parseProduct = (): number => {
    let value = parseNumber();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const operator = source[index];
      index += 1;
      const right = parseNumber();
      if ((operator === '/' || operator === '%') && right === 0) throw new Error('除数不能为 0');
      if (operator === '*') value *= right;
      else if (operator === '/') value /= right;
      else value %= right;
    }
    return value;
  };

  const parseSum = (): number => {
    let value = parseProduct();
    while (peek() === '+' || peek() === '-') {
      const operator = source[index];
      index += 1;
      const right = parseProduct();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const result = parseSum();
  if (index !== source.length) throw new Error(`表达式第 ${index} 个字符起无法解析`);
  if (!Number.isFinite(result)) throw new Error('结果不是有限数');
  return Math.round(result * 1e10) / 1e10;
}

const calculate = tool({
  description:
    '计算一个数学表达式（支持 + - * / % 与括号、小数）。需要精确算数时使用，不要心算。',
  inputSchema: jsonSchema<{ expression: string }>({
    additionalProperties: false,
    properties: {
      expression: { description: '要计算的表达式，例如 (23*17+9)/4', type: 'string' },
    },
    required: ['expression'],
    type: 'object',
  }),
  execute: async ({ expression }) => {
    const result = evaluateExpression(expression);
    return { expression, result };
  },
});

const getCurrentTime = tool({
  description: '获取当前日期与时间。可传 IANA 时区（如 Asia/Shanghai）；默认用本机时区。',
  inputSchema: jsonSchema<{ timezone?: string }>({
    additionalProperties: false,
    properties: {
      timezone: { description: 'IANA 时区名，例如 Asia/Shanghai', type: 'string' },
    },
    type: 'object',
  }),
  execute: async ({ timezone }) => {
    const now = new Date();
    const zone = timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;
    let formatted: string;
    try {
      formatted = new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'full',
        timeStyle: 'medium',
        timeZone: zone,
      }).format(now);
    } catch {
      throw new Error(`不认识的时区：${zone}`);
    }
    return { formatted, iso: now.toISOString(), timezone: zone };
  },
});

const fetchUrl = tool({
  description:
    '抓取一个网页并返回纯文本正文（已去掉 HTML 标签，最多 4000 字）。需要查看某个网址的内容、做小结时使用。',
  inputSchema: jsonSchema<{ url: string }>({
    additionalProperties: false,
    properties: {
      url: { description: '要抓取的完整网址（http/https）', type: 'string' },
    },
    required: ['url'],
    type: 'object',
  }),
  execute: async ({ url }) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch {
      throw new Error(`网址格式不对：${url}`);
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new Error('只支持 http/https 网址');
    }

    const response = await fetch(target, {
      headers: { 'user-agent': 'HearthBot/0.1 (+local)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`抓取失败：HTTP ${response.status}`);

    const html = await response.text();
    const text = html
      .replaceAll(/<script[\s\S]*?<\/script>/gi, ' ')
      .replaceAll(/<style[\s\S]*?<\/style>/gi, ' ')
      .replaceAll(/<[^>]+>/g, ' ')
      .replaceAll(/&nbsp;/g, ' ')
      .replaceAll(/&amp;/g, '&')
      .replaceAll(/&lt;/g, '<')
      .replaceAll(/&gt;/g, '>')
      .replaceAll(/\s+/g, ' ')
      .trim();

    return {
      length: text.length,
      text: text.slice(0, 4000),
      title: /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? null,
      truncated: text.length > 4000,
      url: target.toString(),
    };
  },
});

/** 交给模型的内置工具集（名字即 UI 里的 tool-<name> 前缀） */
export const chatTools = { calculate, fetch_url: fetchUrl, get_current_time: getCurrentTime };
