import { isMoreThanTwoBusinessDaysOld } from '../src/utils/businessDays.js';

function runTests() {
  const isStale = (ticket) => {
    if (['Closed'].includes(ticket.status)) return false;
    return isMoreThanTwoBusinessDaysOld(ticket.updated_at);
  };

  const isEmbarkDelay = (ticket) => {
    if (!isStale(ticket)) return false;
    if (['Waiting on Client', 'Awaiting Client Confirmation', 'Waiting on Third Party', 'Resolved'].includes(ticket.status)) return false;
    return true;
  };

  const oldDate = '2024-05-01T12:00:00Z'; // Way more than 2 business days from 2024-05-08

  global.Date = class extends Date {
    constructor(...args) {
      if (args.length === 0) return new Date('2024-05-08T12:00:00Z'); // mock "now" as Wednesday
      super(...args);
    }
  };

  const check = (status) => {
    const t = { status, updated_at: oldDate };
    return `Follow-Up Required: ${isStale(t)}, Embark Delay: ${isEmbarkDelay(t)}`;
  };

  console.log("D. Waiting on Client >2 business days:", check('Waiting on Client'));
  console.log("E. Awaiting Client Confirmation >2 business days:", check('Awaiting Client Confirmation'));
  console.log("F. Waiting on Third Party >2 business days:", check('Waiting on Third Party'));
  console.log("G. Closed ticket >2 business days:", check('Closed'));
  console.log("H. Resolved ticket awaiting client confirmation:", check('Resolved'));
  console.log("I. New ticket >2 business days:", check('New'));
}

runTests();
