declare global {
  namespace Express {
    export interface Request {
      /** Set by validateRequest: the parsed (coerced, defaulted) request data. */
      validated?: { body: unknown; query: unknown; params: unknown };
    }
  }
}

export {};
