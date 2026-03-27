const { isLockActive } = require('./global-lock');

function getDispatchSkipReason({ isRunning, existingLock, lockStaleMs }) {
  if (isRunning) return 'run_in_progress';
  if (isLockActive(existingLock, lockStaleMs)) return 'global_lock_active';
  return null;
}

module.exports = {
  getDispatchSkipReason
};