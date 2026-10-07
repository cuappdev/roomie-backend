import type { NextFunction, Request, Response } from 'express';

import { Prisma } from '../generated/prisma/client.js';
import { AppError, ConflictError, NotFoundError } from '../utils/AppError.js';

const fromPrisma = (err: Prisma.PrismaClientKnownRequestError) => {
  if (err.code === 'P2002') return new ConflictError('That already exists.');
  if (err.code === 'P2025') return new NotFoundError();
  return null;
};

export const globalErrorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const appError =
    err instanceof AppError
      ? err
      : err instanceof Prisma.PrismaClientKnownRequestError
        ? fromPrisma(err)
        : null;

  if (appError) {
    return res.status(appError.statusCode).json({
      status: appError.status,
      statusCode: appError.statusCode,
      message: appError.message,
      errorCode: appError.errorCode,
      ...(appError.data && { data: appError.data }),
    });
  }

  // Malformed JSON body from express.json()
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    return res.status(400).json({
      status: 'fail',
      statusCode: 400,
      message: 'Malformed JSON body',
      errorCode: 'BAD_REQUEST',
    });
  }

  console.error(err);
  return res.status(500).json({
    status: 'error',
    statusCode: 500,
    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  });
};
