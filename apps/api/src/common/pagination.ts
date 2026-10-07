import { z } from 'zod';
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  q: z.string().trim().max(100).optional(),
});
export type PageQuery = z.infer<typeof pageQuery>;
export const skipTake = (p: PageQuery) => ({ skip: (p.page - 1) * p.pageSize, take: p.pageSize });
export const pageResult = <T>(items: T[], total: number, p: PageQuery) => ({ items, total, page: p.page, pageSize: p.pageSize });
