import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resContent = exception.getResponse() as any;
      if (typeof resContent === 'object') {
        message = resContent.message || message;
        error = resContent.error || error;
      } else {
        message = resContent;
      }
    } else {
      // Log details internally
      this.logger.error(
        `Unhandled Exception at ${request.method} ${request.url}: ${exception.message || exception}`,
        exception.stack,
      );

      // Handle Prisma database constraints
      if (exception.code) {
        if (exception.code === 'P2002') {
          status = HttpStatus.CONFLICT;
          message = 'A resource with this unique field already exists.';
          error = 'Conflict';
        } else if (exception.code === 'P2025') {
          status = HttpStatus.NOT_FOUND;
          message = 'The requested resource was not found.';
          error = 'Not Found';
        }
      }
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: Array.isArray(message) ? message[0] : message,
      error,
    });
  }
}
