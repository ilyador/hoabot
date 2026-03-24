# Multi-User Invite Flow

## Overview

Allow HOA admins to invite board members and homeowners to join their HOA. Board members get management access; homeowners get a limited portal (view dues, submit maintenance requests, read announcements). Invites are DB-backed tokens delivered via email with a copyable link fallback.

## Data Model

### Prerequisite: Formalize Unit-User relation

The existing `Unit.userId` is a bare `String?` with no Prisma relation. Before adding invites, formalize this:

```prisma
// Add to Unit model:
user User? @relation(fields: [userId], references: [id])

// Add to User model:
units Unit[]
```

This adds a proper foreign key constraint so `Unit.userId` cannot reference a nonexistent user.

### New InviteStatus enum and Invite model

```prisma
enum InviteStatus {
  pending
  accepted
  revoked
}

model Invite {
  id         String       @id @default(uuid())
  hoaId      String
  hoa        Hoa          @relation(fields: [hoaId], references: [id], onDelete: Cascade)
  email      String
  role       Role         // restricted to board_member or homeowner at the API level
  unitId     String?      // required for homeowner, FK to Unit
  unit       Unit?        @relation(fields: [unitId], references: [id])
  token      String       @unique // unique index is created automatically
  status     InviteStatus @default(pending)
  invitedBy  String
  inviter    User         @relation("InvitedBy", fields: [invitedBy], references: [id])
  expiresAt  DateTime     // createdAt + 30 days
  acceptedAt DateTime?
  createdAt  DateTime     @default(now())

  @@index([hoaId])
  @@index([email, hoaId])
}
```

Note: `expired` is not an enum value. Expiry is computed at read time by checking `status == pending && expiresAt < now()`. This avoids needing a cron job or write-on-read side effects.

Relations to add:
- `Hoa.invites Invite[]`
- `Unit.invites Invite[]`
- `User.invitedMembers Invite[] @relation("InvitedBy")`

## Server Endpoints

### Members Router (`server/src/routers/members.ts`)

All use `adminProcedure` (auth + hoaId + admin/board_member role + subscription check).

**`members.invite`**
- Input: `{ email: string, role: z.enum(['board_member', 'homeowner']), unitId?: string }`
- Zod schema must restrict role to `board_member` and `homeowner` only — NOT the full Role enum — to prevent privilege escalation.
- Validations:
  - `unitId` required when role is `homeowner`
  - Unit exists and belongs to this HOA
  - Unit does not already have a `userId` set
  - No pending (non-expired) invite exists for same email + hoaId
- Creates Invite row with random URL-safe token, expiresAt = now + 30 days
- Sends invite email via Resend (with link to `/join/{token}`)
- Returns `{ invite, link, emailSent: boolean }`
- If email fails, still returns the link with a warning

**`members.listInvites`**
- Returns all invites for the HOA, ordered by createdAt desc
- Includes: email, role, status, unit address (if linked), inviter name, expiresAt
- Computes effective status: if `status == pending && expiresAt < now()`, return `expired` as the displayed status. The DB value stays `pending` — no write-on-read.

**`members.revokeInvite`**
- Input: `{ inviteId: string }`
- Sets status to `revoked`
- Validates invite belongs to this HOA

**`members.resendInvite`**
- Input: `{ inviteId: string }`
- Validates invite is still `pending` and not expired
- Generates a new token (invalidates old link), resets `expiresAt` to now + 30 days
- Re-sends email, returns updated link

**`members.list`**
- Returns all users in this HOA with their name, email, role, createdAt

**`members.remove`**
- Input: `{ userId: string }`
- Validates target user belongs to this HOA
- Validates caller is not removing themselves
- Sets `User.hoaId` to null, sets `User.role` to `admin` (reset to default)
- Clears `Unit.userId` for any units linked to this user
- Does NOT delete the user account

### Auth Router Additions

Both are public endpoints. They inherit the existing rate limiting applied to `/api/trpc/*` in index.ts (auth endpoints: 10 req/min).

**`auth.validateInvite`** (publicProcedure)
- Input: `{ token: string }`
- Returns `{ email, role, hoaName, unitAddress? }` or error
- Checks: status is `pending`, `expiresAt > now()`
- Error messages: "This invite has expired", "This invite has been revoked", "This invite has already been used"

**`auth.registerWithInvite`** (publicProcedure)
- Input: `{ token: string, name: string, password: string(min 8) }`
- Validates token (pending, not expired)
- Checks for existing user with this email:
  - If user exists with a different hoaId: "This email is already associated with another HOA"
  - If user exists with the same hoaId: "This user is already a member of this HOA"
  - If user exists with null hoaId (previously removed): re-link them — set their `hoaId`, `role` from invite, link unit if applicable. No new account created.
- If no existing user: creates user with role and hoaId from invite
- If invite has unitId, sets `Unit.userId` to new user's id
- Sets invite status to `accepted`, sets `acceptedAt`
- Signs JWT, sets cookie (same as existing register flow)
- Returns user data

## Frontend

### New Pages

**`JoinPage.tsx`** (public route: `/join/:token`)
- On load: calls `auth.validateInvite` with token from URL params
- Shows invite details: "You've been invited to **{hoaName}** as a **{role}**"
- If homeowner with unit: "You'll be linked to **{unitAddress}**"
- Registration form: name, password, confirm password (email pre-filled and read-only from invite)
- On submit: calls `auth.registerWithInvite`
- Error states: expired, revoked, already used, email taken
- Matches existing auth page styling (LoginPage/RegisterPage)

**`MembersPage.tsx`** (authed route: `/members`)
- Two sections:
  1. **Current Members** — table with name, email, role, joined date. Each row has a "Remove" button (with confirmation) that calls `members.remove`. Admin's own row has no remove button.
  2. **Pending Invites** — table with email, role, unit (if any), effective status (computed), expires. Actions: Revoke, Resend, Copy Link. Expired invites shown as greyed out.
- "Invite Member" button at top opens inline form: email input, role dropdown (board_member/homeowner), unit picker (visible when homeowner selected, populated from units without a userId). On submit, shows the copyable invite link + email sent confirmation.

### Layout Changes

- Add "Members" to sidebar nav under Management group, between "Units & Owners" and "Invoices". Icon: `👥`
- The "Members" nav link and `/members` route are only rendered for users with `admin` or `board_member` role. Homeowners do not see it.

### App.tsx Routing

- Add `/join/:token` as a public route alongside `/login` and `/register` (in the unauthenticated routes block)
- Add `/members` route in the authenticated layout, gated by role

## Permissions

- Only `admin` and `board_member` can manage members and invites (`adminProcedure`)
- Homeowners see nothing related to invites or member management (nav link hidden, route not rendered)
- Zod validation on `members.invite` restricts invitable roles to `board_member` and `homeowner` — `admin` cannot be assigned via invite
- A user can only belong to one HOA

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Duplicate pending invite (same email + hoaId) | Block: "Pending invite already exists — revoke it first or resend" |
| Unit already has a userId | Block: "This unit already has an owner assigned" |
| Expired token | validateInvite returns error, JoinPage shows "This invite has expired" |
| Revoked token | validateInvite returns error, JoinPage shows "This invite has been revoked" |
| Already-used token | validateInvite returns error, JoinPage shows "This invite has already been used" |
| Email exists, different HOA | registerWithInvite rejects: "This email is already associated with another HOA" |
| Email exists, same HOA | registerWithInvite rejects: "This user is already a member of this HOA" |
| Email exists, null hoaId (previously removed) | registerWithInvite re-links the user: sets hoaId, role, unit from invite |
| Email not configured (no RESEND_API_KEY) | Invite created, link returned, warning shown: "Email couldn't be sent — share this link manually" |
| Admin tries to remove themselves | Block: "You cannot remove yourself" |
| Removed user tries to access app | `me` returns null hoaId, redirected to SetupHoaPage |

## Out of Scope

- Role changes after join (promote/demote)
- Transferring unit ownership
- Bulk invite / CSV import
- Homeowner self-registration with join code

These are natural follow-ups for separate specs.

## Testing

Integration tests covering:
- Invite creation with validation (duplicate, unit ownership, role+unitId check, admin role rejected)
- Token validation (valid, expired, revoked, used)
- Registration with invite (happy path, links unit, sets role)
- Re-linking a previously removed user via invite
- Resend generates new token and resets expiry
- Revoke prevents acceptance
- Effective status computation (pending + past expiresAt = expired)
- Remove member unlinks hoaId and unit
- Admin cannot remove themselves
- Homeowner cannot access members endpoints
