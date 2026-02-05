import { ZodError } from 'zod';
import sendProblem from '../utils/problemResponse.js';

// validate(schema, location) -> middleware
export default function validate(schema, location = 'body') {
  return (req, res, next) => {
    try {
      const target = req[location];
      const result = schema.parse(target || {});
      // assign parsed/coerced value back
      req[location] = result;
      return next();
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
        return sendProblem(res, 400, 'Bad Request', messages);
      }
      return sendProblem(res, 400, 'Bad Request', 'Invalid request');
    }
  };
}
