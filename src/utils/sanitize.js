// Simple sanitizer: escape basic HTML chars in strings
export function sanitize(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/[<>&"']/g, function (c) {
    return ({
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      '"': '&quot;',
      "'": '&#39;'
    })[c];
  });
}

export default sanitize;
