import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
/** Einheitliches Fehlerformat {code, message, requestId}; niemals Stacktraces nach außen. */
export declare class AllExceptionsFilter implements ExceptionFilter {
    private readonly log;
    catch(exception: unknown, host: ArgumentsHost): void;
}
