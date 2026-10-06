import { z } from 'zod';
export declare const pageQuery: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    q?: string | undefined;
}, {
    q?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
export type PageQuery = z.infer<typeof pageQuery>;
export declare const skipTake: (p: PageQuery) => {
    skip: number;
    take: number;
};
export declare const pageResult: <T>(items: T[], total: number, p: PageQuery) => {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
};
