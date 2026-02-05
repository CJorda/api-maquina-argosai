export function sendProblem(res, status, title, detail, type = 'about:blank') {
  return res.status(status).type('application/problem+json').json({
    type,
    title,
    status,
    detail
  });
}

export default sendProblem;
