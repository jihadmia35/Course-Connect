import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
const id = z.uuid().parse(process.env.ADMIN_USER_ID);
const connectionString = z
  .string()
  .min(1)
  .parse(process.env.DIRECT_URL || process.env.DATABASE_URL);
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });
try {
  await client.adminUser.upsert({ where: { userId: id }, create: { userId: id }, update: {} });
  console.log('Administrator mapping granted to the specified Auth user UUID.');
} finally {
  await client.$disconnect();
}
