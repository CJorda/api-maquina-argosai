import { z } from 'zod';

export const STATUS_ENUM = z.enum(['PENDING', 'COMPLETED', 'FAILED']);

export const createDataSchema = z.object({
  value: z.string().min(1, 'value must not be empty'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  status: STATUS_ENUM.optional()
});

export const getDataQuerySchema = z.object({
  page_size: z.coerce.number().int().positive().max(100).optional(),
  cursor: z.string().optional(),
  fields: z.string().optional()
});

export default { createDataSchema, getDataQuerySchema };
