const HEADERS = {
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

export default {
  async fetch(request) {
    const origin = await fetch(request);
    const response = new Response(origin.body, origin);
    for (const [name, value] of Object.entries(HEADERS)) response.headers.set(name, value);
    if (response.headers.get('content-type')?.includes('text/html')) {
      response.headers.set('content-security-policy',
        "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; upgrade-insecure-requests");
    }
    return response;
  },
};
