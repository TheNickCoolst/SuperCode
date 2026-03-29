import cron from 'node-cron';

export type HeartbeatCallback = (prompt: string) => Promise<void>;

/**
 * Initializes scheduled events for SuperCode.
 * @param onEvent Callback triggered when a scheduled event fires.
 */
export function initHeartbeat(onEvent: HeartbeatCallback): void {
  console.log('[Heartbeat] Initializing schedules...');

  // 1. Daily Morning Briefing at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    try {
      await onEvent("SYSTEM EVENT: Morning Briefing. Say good morning, check the weather, and summarize any important pending things from memory.");
    } catch (err) {
      console.error('[Heartbeat Error] Morning Briefing failed:', err);
    }
  });

  // 2. Demo Proactive Event: Every 1 minute for testing purposes
  cron.schedule('* * * * *', async () => {
    try {
      // Very short check-in so we don't spam the console too much during testing
      await onEvent("SYSTEM EVENT: Proactive check-in. Just say hello and briefly state that a scheduled minute passed.");
    } catch (err) {
      console.error('[Heartbeat Error] Demo check-in failed:', err);
    }
  });

  console.log('[Heartbeat] Schedules active. (Daily briefing at 8:00 AM, and test pings every minute)');
}
