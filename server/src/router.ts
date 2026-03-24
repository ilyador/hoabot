import { router } from './trpc.js';
import { authRouter } from './routers/auth.js';
import { hoaRouter } from './routers/hoa.js';
import { unitsRouter } from './routers/units.js';
import { invoicesRouter } from './routers/invoices.js';
import { documentsRouter } from './routers/documents.js';
import { announcementsRouter } from './routers/announcements.js';
import { violationsRouter } from './routers/violations.js';
import { maintenanceRouter } from './routers/maintenance.js';
import { aiRouter } from './routers/ai.js';
import { stripeRouter } from './routers/stripe.js';
import { emailRouter } from './routers/email.js';
import { homeownerRouter } from './routers/homeowner.js';
import { xeroRouter } from './routers/xero.js';
import { subscriptionRouter } from './routers/subscription.js';
import { membersRouter } from './routers/members.js';

export const appRouter = router({
  auth: authRouter,
  hoa: hoaRouter,
  units: unitsRouter,
  invoices: invoicesRouter,
  documents: documentsRouter,
  announcements: announcementsRouter,
  violations: violationsRouter,
  maintenance: maintenanceRouter,
  ai: aiRouter,
  stripe: stripeRouter,
  email: emailRouter,
  homeowner: homeownerRouter,
  xero: xeroRouter,
  subscription: subscriptionRouter,
  members: membersRouter,
});

export type AppRouter = typeof appRouter;
