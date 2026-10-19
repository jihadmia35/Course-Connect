import { readdirSync, existsSync } from 'node:fs';
export function migrationNames() {
  return readdirSync('prisma/migrations', { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(`prisma/migrations/${entry.name}/migration.sql`),
    )
    .map((entry) => entry.name)
    .sort();
}
