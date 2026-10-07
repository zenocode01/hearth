import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dbCredentials: {
    url: './data/app.db',
  },
  dialect: 'sqlite',
  out: './lib/db/migrations',
  schema: './lib/db/schema.ts',
});
