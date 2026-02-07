import { z } from 'zod';

const isoDateTime = z.union([
  z.string().datetime({ offset: true }),
  z.string().datetime({ offset: false })
]);

export const startInferenceSchema = z.object({
  started_at: isoDateTime,
  species: z.string().min(1).optional(),
  batch_id: z.string().min(1).optional(),
  notes: z.string().max(2000).optional(),
  operator_id: z.string().min(1).optional(),
  target_count: z.number().int().nonnegative().optional(),
  target_biomass_kg: z.number().nonnegative().optional()
});

export const endInferenceSchema = z.object({
  inference_id: z.string().uuid(),
  ended_at: isoDateTime,
  reason: z.string().max(500).optional(),
  final_count: z.number().int().nonnegative().optional(),
  final_biomass_kg: z.number().nonnegative().optional()
});

export const createCountSchema = z.object({
  inference_id: z.string().uuid(),
  counted_at: isoDateTime,
  fish_count: z.number().int().nonnegative(),
  biomass_kg: z.number().nonnegative(),
  avg_weight_g: z.number().nonnegative().optional(),
  confidence: z.number().min(0).max(1).optional(),
  frame_count: z.number().int().positive().optional(),
  notes: z.string().max(1000).optional()
});

export const listInferencesQuerySchema = z.object({
  machine_id: z.string().min(1).optional(),
  status: z.enum(['running', 'completed']).optional(),
  limit: z.coerce.number().int().positive().max(500).optional()
});

export const listCountsQuerySchema = z.object({
  inference_id: z.string().uuid().optional(),
  machine_id: z.string().min(1).optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  limit: z.coerce.number().int().positive().max(500).optional()
});

export default {
  startInferenceSchema,
  endInferenceSchema,
  createCountSchema,
  listInferencesQuerySchema,
  listCountsQuerySchema
};
