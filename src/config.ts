/**
 * Configuration defaults matching Allium spec
 */
export const CONFIG = {
  dispatch_delay_ms: 2 * 60 * 60 * 1000, // 2 hours
  nudge_delay_ms: 3 * 24 * 60 * 60 * 1000, // 3 days
  cooldown_period_ms: 90 * 24 * 60 * 60 * 1000, // 90 days
  dnd_start_hour: 20,
  dnd_end_hour: 8,
  morning_dispatch_hour: 8,
  morning_dispatch_minute: 30,
};
