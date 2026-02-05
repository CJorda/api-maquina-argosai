import express from 'express';
import { getData, createData } from '../controllers/dataController.js';
import apiKeyAuth from '../middlewares/apiKeyAuth.js';
import validate from '../middlewares/validate.js';
import { createDataSchema, getDataQuerySchema } from '../schemas/dataSchemas.js';

const router = express.Router();
// Resource paths follow plural kebab-case: /data-records
router.get('/data-records', apiKeyAuth, validate(getDataQuerySchema, 'query'), getData);
router.post('/data-records', apiKeyAuth, validate(createDataSchema, 'body'), createData);

export default router;
