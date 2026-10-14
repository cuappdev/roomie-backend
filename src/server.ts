import 'dotenv/config';

import { createApp } from './app.js';
import { prisma } from './prisma.js';

const port = process.env.PORT || '8000';
const app = createApp();

const server = app.listen(port, async () => {
  console.log(`Roomie API listening at http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  try {
    await prisma.$connect();
    console.log('Database connected');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  }
});

const shutdown = () => {
  console.log('Shutting down gracefully...');
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
