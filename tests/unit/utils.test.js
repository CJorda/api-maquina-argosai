import { describe, it, expect } from 'vitest';
import { sanitize } from '../../src/utils/sanitize.js';
import sendProblem from '../../src/utils/problemResponse.js';

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    type() { return this; },
    json(payload) { this.body = payload; return this; }
  };
}

describe('utils', () => {
  it('sanitize escapes basic html chars', () => {
    const out = sanitize("<>&\"'");
    expect(out).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('sendProblem formats problem+json response', () => {
    const res = makeRes();
    sendProblem(res, 400, 'Bad Request', 'Invalid');
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('title', 'Bad Request');
    expect(res.body).toHaveProperty('detail', 'Invalid');
  });
});
