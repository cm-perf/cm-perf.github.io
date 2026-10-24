import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../tools/security_headers/worker.js';

test('adds browser protections without changing the origin response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<h1>Order</h1>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'max-age=300' },
  });
  try {
    const response = await worker.fetch(new Request('https://cmperf.uk/order.html'));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<h1>Order</h1>');
    assert.equal(response.headers.get('cache-control'), 'max-age=300');
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
