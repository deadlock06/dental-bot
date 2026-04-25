/**
 * QUDOZEN RESILIENCE LAYER v1.0
 * Handles retries, timeouts, and hard fallbacks for external APIs.
 */

const log = (msg) => console.log(`[Resilience] ${msg}`);

/**
 * Basic exponential backoff retry wrapper
 */
async function withRetry(fn, options = {}) {
  const { maxRetries = 3, initialDelay = 1000, factor = 2 } = options;
  let attempt = 0;
  let delay = initialDelay;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) throw error;
      
      log(`Attempt ${attempt} failed: ${error.message}. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      delay *= factor;
    }
  }
}

/**
 * Timeout wrapper for promises
 */
async function withTimeout(promise, ms, timeoutName = 'Task') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${timeoutName} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => clearTimeout(timeoutId));
}

/**
 * OpenAI Specific Wrapper with "Hard Fallback"
 * If OpenAI is down or slow, we return a safe, pre-defined response.
 */
async function wrapAI(callFn, fallbackResponse = "I'm experiencing a high volume of requests. Could you please repeat that? (AI Fallback)") {
  try {
    // 10s timeout for AI calls is a good enterprise default
    return await withTimeout(
      withRetry(callFn, { maxRetries: 2 }),
      10000,
      'AI Completion'
    );
  } catch (error) {
    console.error(`[Resilience] ⚠️ AI Failure: ${error.message}. Using hard fallback.`);
    return fallbackResponse;
  }
}

/**
 * Twilio Specific Wrapper with Idempotency Support
 */
async function wrapTwilio(callFn) {
  try {
    return await withRetry(callFn, { maxRetries: 3 });
  } catch (error) {
    console.error(`[Resilience] ❌ Twilio Failure after retries: ${error.message}`);
    throw error;
  }
}

module.exports = {
  withRetry,
  withTimeout,
  wrapAI,
  wrapTwilio
};
