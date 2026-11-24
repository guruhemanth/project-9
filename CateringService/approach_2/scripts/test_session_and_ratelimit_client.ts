import assert from 'node:assert';
import { ApiError } from '../frontend/customer/src/lib/api-client';

async function runTests() {
  console.log('🧪 Starting Session and Rate Limit Error Handling Tests...\n');

  // Test 1: ApiError structure for Rate Limit (HTTP 429)
  const rateLimitErr = new ApiError(
    'Rate limit exceeded: Too many sign-in / registration attempts from your IP (maximum 10 requests per minute allowed for security). Please wait 45 seconds before trying again.',
    429,
    {
      code: 'RATE_LIMIT_EXCEEDED',
      cause: 'Too many sign-in / registration attempts from your IP (maximum 10 requests per minute allowed for security).',
      retryAfter: 45,
    }
  );

  assert.strictEqual(rateLimitErr.status, 429, 'Status should be 429');
  assert.strictEqual(rateLimitErr.isRateLimit, true, 'isRateLimit should be true');
  assert.strictEqual(rateLimitErr.isSessionError, false, 'isSessionError should be false');
  assert.strictEqual(rateLimitErr.retryAfter, 45, 'retryAfter should be 45');
  assert.ok(rateLimitErr.causeDescription?.includes('Too many sign-in'), 'Cause description should be captured');
  assert.ok(rateLimitErr.message.includes('Please wait 45 seconds'), 'Meaningful message includes retry timer');
  console.log('✅ Test 1 Passed: ApiError correctly represents 429 Rate Limit with cause and retry duration');

  // Test 2: ApiError structure for Session Expiration (HTTP 401)
  const sessionErr = new ApiError(
    'Your session has expired. Please sign in again to continue.',
    401,
    {
      code: 'SESSION_EXPIRED',
      cause: 'Session expired or invalidated',
    }
  );

  assert.strictEqual(sessionErr.status, 401, 'Status should be 401');
  assert.strictEqual(sessionErr.isSessionError, true, 'isSessionError should be true');
  assert.strictEqual(sessionErr.isRateLimit, false, 'isRateLimit should be false');
  assert.strictEqual(sessionErr.code, 'SESSION_EXPIRED', 'Code should be SESSION_EXPIRED');
  console.log('✅ Test 2 Passed: ApiError correctly represents 401 Session Expiration');

  // Test 3: ApiError structure for 403 Forbidden with expired token code
  const forbiddenSessionErr = new ApiError(
    'Token has expired',
    403,
    {
      code: 'SESSION_EXPIRED',
    }
  );
  assert.strictEqual(forbiddenSessionErr.isSessionError, true, '403 with expired code should be flagged as session error');
  console.log('✅ Test 3 Passed: 403 with SESSION_EXPIRED correctly classified as session error');

  console.log('\n🎉 All Client-side Error Handling Assertions Passed!');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
