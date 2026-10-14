import helmet from 'helmet';

import express from 'express';
import type { Request, Response } from 'express';

import { globalErrorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/logger.js';
import { ipRateLimiter } from './middleware/rateLimit.js';
import { prisma } from './prisma.js';
import { NotFoundError } from './utils/AppError.js';

export const createApp = () => {
  const app = express();

  // Behind nginx / a load balancer in deployment
  app.set('trust proxy', 1);

  if (process.env.NODE_ENV !== 'test') app.use(requestLogger);
  app.use(helmet());
  app.use(express.json({ limit: '1mb' }));
  if (process.env.NODE_ENV !== 'test') app.use(ipRateLimiter);

  const router = express.Router();

  router.get('/health', async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: 'healthy',
        database: 'connected',
        uptime: process.uptime(),
      });
    } catch {
      res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
    }
  });

  // Feature routers (auth, users, houses, chores, shopping) get mounted here.
  // They live on the mvp-features branch.

  app.use(router);

  app.use((_req: Request) => {
    throw new NotFoundError('Route not found.');
  });
  app.use(globalErrorHandler);

  return app;
};
