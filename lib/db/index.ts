import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import * as schema from './schema';

type Db = BetterSQLite3Database<typeof schema>;

// dev 下模块会热重载，用 globalThis 保住单例，避免重复打开连接
const globalForDb = globalThis as unknown as { __piWebDb?: Db };

/**
 * 找项目根：Next 的服务器进程 cwd 不一定是仓库根（dev 下可能是 .next 内部目录），
 * 所以从 cwd 逐级向上找带 package.json 的目录。
 */
function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function findMigrationsFolder(root: string): string {
  const candidate = path.join(root, 'lib', 'db', 'migrations');
  if (existsSync(path.join(candidate, 'meta', '_journal.json'))) return candidate;

  // 兜底：从 cwd 逐级向上找
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const nested = path.join(dir, 'lib', 'db', 'migrations', 'meta', '_journal.json');
    if (existsSync(nested)) return path.dirname(path.dirname(nested));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(`找不到数据库迁移目录（root=${root}, cwd=${process.cwd()}）`);
}

function openDb(): Db {
  const root = findProjectRoot();
  const dbDir = path.join(root, 'data');
  mkdirSync(dbDir, { recursive: true });

  const sqlite = new Database(path.join(dbDir, 'app.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const instance = drizzle(sqlite, { schema });
  // 首次打开时自动应用迁移（幂等），这样 npm run dev 无需手动步骤
  migrate(instance, { migrationsFolder: findMigrationsFolder(root) });
  return instance;
}

export function getDb(): Db {
  globalForDb.__piWebDb ??= openDb();
  return globalForDb.__piWebDb;
}

export { schema };
