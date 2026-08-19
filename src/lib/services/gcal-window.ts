/** Add `days` to a `YYYY-MM-DD` string without going through a timezone. */
function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The calendar window for a task due at `dueTime` on `dueDate`: a one-hour block.
 *
 * Both ends are always returned — Google keeps the old `end` when you patch only `start`,
 * which silently produced negative-length events for late-evening tasks. The times are
 * wall-clock strings; the caller passes the user's `timeZone` alongside them.
 */
export function dueWindowToGcal(dueDate: string, dueTime: string): { startTime: string; endTime: string } {
  const [h, m] = dueTime.split(":").map(Number);
  const startMinutes = h * 60 + m;
  const endMinutes = startMinutes + 60;

  const startTime = `${dueDate}T${pad(h)}:${pad(m)}:00`;
  const endDate = endMinutes >= 24 * 60 ? shiftDate(dueDate, 1) : dueDate;
  const wrapped = endMinutes % (24 * 60);
  const endTime = `${endDate}T${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}:00`;

  return { startTime, endTime };
}
