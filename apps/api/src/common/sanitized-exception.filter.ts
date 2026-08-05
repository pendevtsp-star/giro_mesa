import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { sanitizeSensitiveData } from "./sensitive-data";

@Catch()
export class SanitizedExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const response =
      exception instanceof HttpException
        ? exception.getResponse()
        : { error: "internal_error", message: "Internal server error" };
    return reply.status(status).send(sanitizeSensitiveData(response));
  }
}
