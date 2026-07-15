// The one address the public is told to write to. It is load-bearing twice over: the
// Grievance Officer channel under the IT Rules 2021 (/grievance) and the data-protection
// contact under the DPDP Act (/privacy). Both pages read from here so the two statutory
// channels cannot drift apart - a published legal contact that nobody reads is the failure
// mode this module exists to prevent.
//
// NEXT_PUBLIC_* is inlined at BUILD time, so changing the env var in Vercel does not move
// an already-built page: it needs a redeploy. The fallback below is therefore what actually
// ships whenever the var is unset, which is why it must stay a real, monitored mailbox.
export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL || 'shelock221bholmes@gmail.com';

// Named publicly on /grievance as required by IT Rules 2021 r.3(2)(a), which also requires
// the officer be resident in India.
export const GRIEVANCE_OFFICER_NAME = 'Vikas Singh';
