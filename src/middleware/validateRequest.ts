import { ZodError, type ZodType, type z } from 'zod';

import type { NextFunction, Request, Response } from 'express';

import { ValidationError } from '../utils/AppError.js';

/**
 * Same idea as Eatery's validateRequest, but it also keeps the parsed result
 * (with coercions and defaults applied) on req.validated so controllers get typed data.
 */
export const validateRequest =
  (schema: ZodType) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.validated = schema.parse({
        body: req.body ?? {},
        query: req.query,
        params: req.params,
      }) as Request['validated'];
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const formatted = Object.fromEntries(
          err.issues.map((issue) => [issue.path.join('.'), issue.message]),
        );
        return next(
          new ValidationError('Request validation failed', formatted),
        );
      }
      next(err);
    }
  };

/** Typed access to what validateRequest(schema) parsed. */
export const valid = <S extends ZodType>(req: Request, _schema: S) =>
  req.validated as z.infer<S>;
