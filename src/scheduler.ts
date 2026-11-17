import { CONFIG } from './config.ts';

/**
 * Calculates dispatch time enforcing Do Not Disturb (DND) window:
 * Delay = 2 hours. If target time falls between 20:00 and 08:00 local time,
 * shift target time to 08:30 of the next morning.
 */
export function calculateDispatchTime(from: Date = new Date()): Date {
  const target = new Date(from.getTime() + CONFIG.dispatch_delay_ms);
  const hour = target.getHours();

  if (hour >= CONFIG.dnd_start_hour || hour < CONFIG.dnd_end_hour) {
    const nextMorning = new Date(target.getTime());
    if (hour >= CONFIG.dnd_start_hour) {
      nextMorning.setDate(nextMorning.getDate() + 1);
    }
    nextMorning.setHours(CONFIG.morning_dispatch_hour, CONFIG.morning_dispatch_minute, 0, 0);
    return nextMorning;
  }

  return target;
}

/**
 * Calculates nudge dispatch time enforcing DND window:
 * Delay = 3 days. If target time falls between 20:00 and 08:00,
 * shift to 08:30 of the next morning.
 */
export function calculateNudgeTime(from: Date = new Date()): Date {
  const target = new Date(from.getTime() + CONFIG.nudge_delay_ms);
  const hour = target.getHours();

  if (hour >= CONFIG.dnd_start_hour || hour < CONFIG.dnd_end_hour) {
    const nextMorning = new Date(target.getTime());
    if (hour >= CONFIG.dnd_start_hour) {
      nextMorning.setDate(nextMorning.getDate() + 1);
    }
    nextMorning.setHours(CONFIG.morning_dispatch_hour, CONFIG.morning_dispatch_minute, 0, 0);
    return nextMorning;
  }

  return target;
}
