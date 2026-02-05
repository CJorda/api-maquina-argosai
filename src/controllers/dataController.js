import sendProblem from '../utils/problemResponse.js';
import { sanitize } from '../utils/sanitize.js';

// In-memory data store (example)
const dataStore = [];

export const getData = (req, res) => {
  // `validate` middleware coerces and validated query params already
  const { page_size } = req.query || {};
  // simple full dump (pagination handled elsewhere if needed)
  return res.status(200).json({ data: dataStore });
};

export const createData = (req, res) => {
  if (!req.is('application/json')) {
    return sendProblem(res, 400, 'Bad Request', 'Request body must be JSON (Content-Type: application/json)');
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return sendProblem(res, 400, 'Bad Request', 'Invalid JSON body');
  }

  try {
    const safeValue = sanitize(body.value);
    const id = Date.now().toString();
    const entry = { id, value: safeValue, date: body.date };
    if (body.status) entry.status = body.status;
    dataStore.push(entry);
    return res.status(201).json(entry);
  } catch (err) {
    return sendProblem(res, 500, 'Internal Server Error', 'Could not create resource');
  }
};
