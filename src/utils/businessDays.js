/**
 * Utility for calculating business days (skipping weekends).
 * Holidays are not considered in this simple implementation.
 */

export function isMoreThanTwoBusinessDaysOld(dateString) {
  if (!dateString) return false;
  
  const date = new Date(dateString);
  const now = new Date();
  
  // Strip time for clean day calculation
  date.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  let businessDaysPassed = 0;
  let currentDate = new Date(date);
  
  // Advance day by day until we reach 'now'
  while (currentDate < now) {
    currentDate.setDate(currentDate.getDate() + 1);
    const dayOfWeek = currentDate.getDay();
    // 0 is Sunday, 6 is Saturday
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDaysPassed++;
    }
  }

  return businessDaysPassed > 2;
}
