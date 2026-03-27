class CircuitBreakerOpenError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.meta = meta;
  }
}

function createCircuitBreaker({
  name = 'default-breaker',
  failureThreshold = 3,
  resetTimeoutMs = 30000,
  halfOpenMaxCalls = 1,
  logger = console
} = {}) {
  let state = 'closed'; // closed | open | half_open
  let failures = 0;
  let openedAt = 0;
  let halfOpenCalls = 0;

  function snapshot() {
    return {
      name,
      state,
      failures,
      openedAt,
      openedAtISO: openedAt ? new Date(openedAt).toISOString() : null,
      resetTimeoutMs,
      failureThreshold,
      halfOpenMaxCalls
    };
  }

  function transitionToOpen(reason = 'threshold_reached') {
    state = 'open';
    openedAt = Date.now();
    halfOpenCalls = 0;
    logger.warn(`[CB:${name}] OPEN (${reason})`);
  }

  function transitionToClosed() {
    state = 'closed';
    failures = 0;
    openedAt = 0;
    halfOpenCalls = 0;
    logger.log(`[CB:${name}] CLOSED`);
  }

  function transitionToHalfOpen() {
    state = 'half_open';
    halfOpenCalls = 0;
    logger.warn(`[CB:${name}] HALF_OPEN`);
  }

  async function execute(fn, context = 'operation') {
    if (state === 'open') {
      const elapsed = Date.now() - openedAt;
      if (elapsed < resetTimeoutMs) {
        throw new CircuitBreakerOpenError(
          `Circuit breaker '${name}' aberto para ${context}`,
          snapshot()
        );
      }
      transitionToHalfOpen();
    }

    if (state === 'half_open') {
      halfOpenCalls += 1;
      if (halfOpenCalls > halfOpenMaxCalls) {
        throw new CircuitBreakerOpenError(
          `Circuit breaker '${name}' em HALF_OPEN excedeu limite para ${context}`,
          snapshot()
        );
      }
    }

    try {
      const result = await fn();
      if (state === 'half_open') {
        transitionToClosed();
      } else {
        failures = 0;
      }
      return result;
    } catch (error) {
      failures += 1;

      if (state === 'half_open') {
        transitionToOpen('half_open_failure');
      } else if (failures >= failureThreshold) {
        transitionToOpen('failure_threshold');
      }

      throw error;
    }
  }

  return {
    execute,
    getState: snapshot
  };
}

module.exports = {
  createCircuitBreaker,
  CircuitBreakerOpenError
};
