import { PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { AppError } from './errors';
import { installGermanZodErrors } from './zod-de';

installGermanZodErrors();

export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new AppError('VALIDATION_FAILED', 'Die Eingaben sind ungültig.', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    }
    return r.data;
  }
}
export const zodBody = <T extends ZodTypeAny>(schema: T) => new ZodPipe(schema);
