import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import pino from 'pino';
import type { RequestWithId } from '../types/request-with-id';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'token',
      '*.token',
      'secret',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
});

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info(
        {
          requestId: request.requestId,
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs: Math.round(duration * 100) / 100,
        },
        'request completed',
      );
    });

    next();
  }
}
