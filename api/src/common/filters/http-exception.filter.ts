import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from '../types/request-with-id';

interface NestErrorResponse {
  message?: string | string[];
  error?: string;
  code?: string;
  details?: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();
    const isHttpError = exception instanceof HttpException;
    const status = isHttpError
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = isHttpError ? exception.getResponse() : undefined;
    const normalized =
      typeof payload === 'object' && payload !== null
        ? (payload as NestErrorResponse)
        : {};
    const rawMessage =
      normalized.message ?? (typeof payload === 'string' ? payload : undefined);
    const validationDetails = Array.isArray(rawMessage)
      ? rawMessage
      : undefined;
    const validationCode = [
      'INVALID_ORGANIZATION_ROLE',
      'ASSET_INVALID_FILE_TYPE',
    ].find((code) => validationDetails?.includes(code));
    const message = validationDetails
      ? 'Request validation failed'
      : (rawMessage ??
        (status === 500 ? 'An unexpected error occurred' : 'Request failed'));

    response.status(status).json({
      success: false,
      error: {
        code: normalized.code ?? validationCode ?? this.codeForStatus(status),
        message,
        ...(validationDetails ? { details: validationDetails } : {}),
        ...(!validationDetails && normalized.details !== undefined
          ? { details: normalized.details }
          : {}),
      },
      requestId: request.requestId,
    });
  }

  private codeForStatus(status: number): string {
    const knownCodes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHENTICATED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_SERVER_ERROR',
    };
    return knownCodes[status] ?? `HTTP_${status}`;
  }
}
