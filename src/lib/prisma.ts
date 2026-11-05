import { PrismaClient } from '@prisma/client';

// Create a singleton instance of PrismaClient
export const prisma = new PrismaClient({
  log: ['error', 'warn'],
});
