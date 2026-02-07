import express from 'express';
import apiKeyAuth from '../middlewares/apiKeyAuth.js';
import validate from '../middlewares/validate.js';
import {
  startInference,
  endInference,
  getInference,
  listInferences,
  getInferenceResults,
  getLatestInferenceSummary
} from '../controllers/inferenceController.js';
import {
  startInferenceSchema,
  endInferenceSchema,
  listInferencesQuerySchema
} from '../schemas/inferenceSchemas.js';

const router = express.Router();

router.get('/inference', apiKeyAuth, validate(listInferencesQuerySchema, 'query'), listInferences);
router.get('/inference/latest', apiKeyAuth, getLatestInferenceSummary);
router.get('/inference/:id', apiKeyAuth, getInference);
router.get('/inference/:id/results', apiKeyAuth, getInferenceResults);
router.post('/inference/start', apiKeyAuth, validate(startInferenceSchema, 'body'), startInference);
router.post('/inference/end', apiKeyAuth, validate(endInferenceSchema, 'body'), endInference);

export default router;
