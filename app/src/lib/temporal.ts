import { Temporal } from '@js-temporal/polyfill';

/**
 * Converts a Temporal.PlainDate to a standard JavaScript Date object at local midnight.
 */
export function temporalToDate(plainDate?: Temporal.PlainDate | null): Date | undefined {
  if (!plainDate) return undefined;
  return new Date(plainDate.year, plainDate.month - 1, plainDate.day);
}

/**
 * Converts a standard JavaScript Date object to a Temporal.PlainDate.
 */
export function dateToTemporal(date?: Date | null): Temporal.PlainDate | undefined {
  if (!date) return undefined;
  return Temporal.PlainDate.from({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate()
  });
}

/**
 * Formats an ISO date-time string into a human-readable relative time ("Just now", "5m ago", "2h ago", "3d ago")
 * using standard Temporal API without native JavaScript Date.
 */
export function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return 'Never';

  try {
    const instant = Temporal.Instant.from(isoString);
    const zonedDateTime = instant.toZonedDateTimeISO(Temporal.Now.timeZoneId());
    const now = Temporal.Now.zonedDateTimeISO();

    const duration = now.since(zonedDateTime, {
      largestUnit: 'days',
      smallestUnit: 'seconds',
    });

    if (duration.days >= 7) {
      return zonedDateTime.toPlainDate().toString();
    }
    if (duration.days > 0) return `${duration.days}d ago`;
    if (duration.hours > 0) return `${duration.hours}h ago`;
    if (duration.minutes > 0) return `${duration.minutes}m ago`;
    if (duration.seconds > 10) return `${duration.seconds}s ago`;

    return 'Just now';
  } catch {
    return 'Unknown';
  }
}

/**
 * Formats an ISO string to localized date/time string using Temporal.
 */
export function formatTemporalDateTime(
  isoString?: string | null,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
): string {
  if (!isoString) return '-';

  try {
    const instant = Temporal.Instant.from(isoString);
    return instant.toLocaleString(undefined, options);
  } catch {
    return 'Invalid Date';
  }
}
