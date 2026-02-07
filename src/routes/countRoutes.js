import express from 'express';
import apiKeyAuth from '../middlewares/apiKeyAuth.js';
import validate from '../middlewares/validate.js';
import { createCount, listCounts } from '../controllers/countController.js';
import { createCountSchema, listCountsQuerySchema } from '../schemas/inferenceSchemas.js';

const router = express.Router();

router.get('/counts', apiKeyAuth, validate(listCountsQuerySchema, 'query'), listCounts);
router.post('/counts', apiKeyAuth, validate(createCountSchema, 'body'), createCount);

export default router;
