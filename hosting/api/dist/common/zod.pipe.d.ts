import { PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
export declare class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
    private readonly schema;
    constructor(schema: T);
    transform(value: unknown): z.infer<T>;
}
export declare const zodBody: <T extends ZodTypeAny>(schema: T) => ZodPipe<T>;
