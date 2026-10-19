/**
 * Fictional demo employees and their leave (FR-029, FR-032). Data only: the loader
 * creates the accounts with a sign-in phrase supplied at load time, never stored here.
 * Demo users are always employees, so there is no role field.
 */

/** Reserved for documentation (RFC 2606), so no mail can ever reach a real inbox. */
export const DEMO_EMAIL_DOMAIN = "away-demo.example";

type Region = "QLD" | "NSW" | "HK";

export type DemoEmployee = {
  email: string;
  full_name: string;
  region_code: Region;
  timezone: string;
};

const email = (name: string) => `${name}@${DEMO_EMAIL_DOMAIN}`;

export const DEMO_EMPLOYEES: DemoEmployee[] = [
  { email: email("jordan.pike"), full_name: "Jordan Pike", region_code: "QLD", timezone: "Australia/Brisbane" },
  { email: email("casey.holt"), full_name: "Casey Holt", region_code: "QLD", timezone: "Australia/Brisbane" },
  { email: email("quinn.marsh"), full_name: "Quinn Marsh", region_code: "NSW", timezone: "Australia/Sydney" },
  { email: email("rowan.ellis"), full_name: "Rowan Ellis", region_code: "NSW", timezone: "Australia/Sydney" },
  { email: email("kai.leung"), full_name: "Kai Leung", region_code: "HK", timezone: "Asia/Hong_Kong" },
  { email: email("mei.chan"), full_name: "Mei Chan", region_code: "HK", timezone: "Asia/Hong_Kong" },
];

/**
 * Dates are relative to the week the demo is loaded, so the demo always looks current:
 * `weekOffset` weeks from that Monday, starting on `weekday` (1 = Monday) for
 * `workdays` consecutive weekdays. Leave types are matched by name.
 */
export type DemoRequest = {
  email: string;
  leaveType: string;
  weekOffset: number;
  weekday: 1 | 2 | 3 | 4 | 5;
  workdays: 1 | 2 | 3 | 4 | 5;
  status: "pending" | "approved" | "declined";
  note?: string;
  comment?: string;
};

export const DEMO_REQUESTS: DemoRequest[] = [
  { email: email("jordan.pike"), leaveType: "Annual", weekOffset: -6, weekday: 1, workdays: 5, status: "approved", note: "Family trip" },
  { email: email("jordan.pike"), leaveType: "Annual", weekOffset: 3, weekday: 2, workdays: 3, status: "pending" },
  { email: email("casey.holt"), leaveType: "Personal/Sick", weekOffset: -2, weekday: 3, workdays: 1, status: "approved" },
  { email: email("casey.holt"), leaveType: "Annual", weekOffset: 5, weekday: 1, workdays: 5, status: "pending", note: "Moving house" },
  { email: email("quinn.marsh"), leaveType: "Annual", weekOffset: 0, weekday: 4, workdays: 2, status: "approved" },
  { email: email("quinn.marsh"), leaveType: "Unpaid", weekOffset: 8, weekday: 1, workdays: 2, status: "declined", comment: "That week is the release. Can you move it?" },
  { email: email("rowan.ellis"), leaveType: "Annual", weekOffset: 2, weekday: 1, workdays: 4, status: "pending" },
  { email: email("rowan.ellis"), leaveType: "Personal/Sick", weekOffset: -4, weekday: 2, workdays: 2, status: "approved" },
  { email: email("kai.leung"), leaveType: "Annual", weekOffset: 1, weekday: 3, workdays: 3, status: "approved", comment: "Enjoy the break." },
  { email: email("kai.leung"), leaveType: "Annual", weekOffset: 6, weekday: 1, workdays: 5, status: "declined", comment: "Two people are already away that week." },
  { email: email("mei.chan"), leaveType: "Annual", weekOffset: -3, weekday: 1, workdays: 3, status: "declined" },
  { email: email("mei.chan"), leaveType: "Annual", weekOffset: 4, weekday: 3, workdays: 3, status: "pending" },
];
