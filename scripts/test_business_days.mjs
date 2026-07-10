import { isMoreThanTwoBusinessDaysOld } from '../src/utils/businessDays.js';

function runTests() {
  const now = new Date();
  
  const testCases = [
    { name: "Friday activity -> Monday", daysAgo: 3, isWeekendCross: true, isFriday: true, targetDay: 1 }, // 3 days ago from Monday is Friday
    { name: "Friday activity -> Tuesday", daysAgo: 4, isWeekendCross: true, isFriday: true, targetDay: 2 },
    { name: "Friday activity -> Wednesday", daysAgo: 5, isWeekendCross: true, isFriday: true, targetDay: 3 },
  ];

  // Let's explicitly mock the dates to be precise instead of relative to "now".
  const MONDAY = new Date('2024-05-06T12:00:00Z'); // Monday
  const TUESDAY = new Date('2024-05-07T12:00:00Z'); // Tuesday
  const WEDNESDAY = new Date('2024-05-08T12:00:00Z'); // Wednesday
  const PREV_FRIDAY = new Date('2024-05-03T12:00:00Z'); // Friday

  // Test A: Friday -> Monday
  global.Date = class extends Date {
    constructor(...args) {
      if (args.length === 0) return new Date('2024-05-06T12:00:00Z'); // mock "now" as Monday
      super(...args);
    }
  };
  console.log("A. Friday activity -> Monday:", isMoreThanTwoBusinessDaysOld(PREV_FRIDAY.toISOString())); // Should be false (only 1 biz day: Monday)

  // Test B: Friday -> Tuesday
  global.Date = class extends Date {
    constructor(...args) {
      if (args.length === 0) return new Date('2024-05-07T12:00:00Z'); // mock "now" as Tuesday
      super(...args);
    }
  };
  console.log("B. Friday activity -> Tuesday:", isMoreThanTwoBusinessDaysOld(PREV_FRIDAY.toISOString())); // Should be false (2 biz days: Mon, Tue)

  // Test C: Friday -> Wednesday
  global.Date = class extends Date {
    constructor(...args) {
      if (args.length === 0) return new Date('2024-05-08T12:00:00Z'); // mock "now" as Wednesday
      super(...args);
    }
  };
  console.log("C. Friday activity -> Wednesday:", isMoreThanTwoBusinessDaysOld(PREV_FRIDAY.toISOString())); // Should be true (3 biz days: Mon, Tue, Wed)

  // Test scenarios for status logic (from SupportIssues.jsx)
  const isStale = (ticket) => {
    if (['Resolved', 'Closed'].includes(ticket.status)) return false;
    return isMoreThanTwoBusinessDaysOld(ticket.updated_at);
  };

  const oldDate = '2024-05-01T12:00:00Z'; // Way more than 2 business days from 2024-05-08

  console.log("D. Waiting on Client >2 business days:", isStale({ status: 'Waiting on Client', updated_at: oldDate }));
  console.log("E. Awaiting Client Confirmation >2 business days:", isStale({ status: 'Awaiting Client Confirmation', updated_at: oldDate }));
  console.log("F. Waiting on Third Party >2 business days:", isStale({ status: 'Waiting on Third Party', updated_at: oldDate }));
  console.log("G. Closed ticket >2 business days:", isStale({ status: 'Closed', updated_at: oldDate }));
  console.log("H. Resolved ticket awaiting client confirmation:", isStale({ status: 'Resolved', updated_at: oldDate }));
}

runTests();
