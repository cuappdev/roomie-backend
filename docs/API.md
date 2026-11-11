# Roomie API (MVP)

Base URL (local): `http://localhost:8000`. JSON in and out.

Every route except `/health` and `/auth/login` needs `Authorization: Bearer <Firebase ID token>`. Locally you can use `Bearer dev:<netid>`.

**Errors** always look like this:

```json
{ "status": "fail", "statusCode": 400, "message": "Request validation failed",
  "errorCode": "VALIDATION_ERROR", "data": { "body.name": "Too small: expected string to have >=1 characters" } }
```

`errorCode` is one of `VALIDATION_ERROR`, `BAD_REQUEST`, `UNAUTHORIZED` (missing or expired token: refresh and retry), `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` or `TOO_MANY_REQUESTS`.

**Types used below:** `User` = `{ id, netid, name, avatarUrl, presence: "HOME"|"AWAY" }`. Dates are `"YYYY-MM-DD"`, timestamps are ISO 8601, and money is whole cents.

---

## Auth and me

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/login` | – | `201` first time / `200` after: `{ isNewUser, user, house, pendingInvites }` |
| GET | `/users/me` | – | `{ user, house, pendingInvites }` |
| PATCH | `/users/me` | `{ name?, major?, presence? }` | same as GET |

`house` is `{ id, name, color, role }` or `null`. `pendingInvites` are `[{ id, createdAt, house: { id, name, color, members: User[] }, invitedBy: User }]`.

**Which screen to open:** `house` set → Home. Otherwise, `pendingInvites` not empty → "Join The Linden Loft?". Otherwise → onboarding.

## Houses (onboarding and settings)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/houses` | `{ name, color?, livingType?, address?, unit?, leaseEndsOn?, timezone?, features?, inviteNetids? }` | `201 { house }` |
| POST | `/houses/join` | `{ inviteCode }` (case-insensitive) | `{ house }` |
| POST | `/invites/:inviteId/accept` | – | `{ house }` |
| POST | `/invites/:inviteId/decline` | – | `204` |
| GET | `/houses/:houseId` | – | `{ house }` |
| PATCH | `/houses/:houseId` | any field from create except `inviteNetids` | `{ house }` |
| POST | `/houses/:houseId/invites` | `{ netids: ["sc2291"] }` | `201 { house }` |
| DELETE | `/houses/:houseId/invites/:inviteId` | – | `204` |
| POST | `/houses/:houseId/invite-code` | – (owner only) | `{ house }` with a new code |
| DELETE | `/houses/:houseId/members/me` | – | `204` (leave) |
| DELETE | `/houses/:houseId/members/:userId` | – (owner only) | `204` |

`house`:

```json
{ "id": 1, "name": "The Linden Loft", "color": "#8B5A34", "inviteCode": "LOFT-4827",
  "livingType": "OFF_CAMPUS", "address": "112 Linden Ave", "unit": "Apt 3B",
  "leaseEndsOn": "2027-05-31", "timezone": "America/New_York",
  "features": ["BILLS","CHORES","SHOPPING","CALENDAR","STORAGE","MOODBOARD"],
  "members": [{ "id": 1, "netid": "lk452", "name": "Leah Kim", "avatarUrl": null, "presence": "HOME", "role": "OWNER", "joinedAt": "…" }],
  "pendingInvites": [{ "id": 3, "netid": "mv384", "createdAt": "…" }] }
```

Rules: one house per person (`409` if you're already in one). Non-members get `404` for anything under `/houses/:houseId`. If the owner leaves, the longest-standing member becomes owner, and the last person to leave deletes the house.

## Chores

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/houses/:houseId/chores` | – | `{ chores: Chore[] }` |
| POST | `/houses/:houseId/chores` | `{ title, frequency, startsOn, rotation: userId[], allowSwaps?, reminderHour? }` | `201 { chore }` |
| GET | `/houses/:houseId/chores/:choreId` | – | `{ chore }` |
| PATCH | `/houses/:houseId/chores/:choreId` | any create field | `{ chore }` |
| DELETE | `/houses/:houseId/chores/:choreId` | – | `204` |
| GET | `/houses/:houseId/chore-assignments` | `?from=&to=&assignee=me\|<id>&includeOverdue=true` | `{ assignments: Turn[] }` |
| POST | `/houses/:houseId/chore-assignments/:id/complete` | – | `{ assignment }` |
| DELETE | `/houses/:houseId/chore-assignments/:id/complete` | – | `{ assignment }` (undo) |
| POST | `/houses/:houseId/chore-assignments/:id/swap` | `{ withAssignmentId }` | `{ assignments: [Turn, Turn] }` |
| GET | `/houses/:houseId/chores/stats` | `?month=YYYY-MM` (default: this month) | `{ month, members: [{ user, done }] }` |

- `frequency` is one of `DAILY`, `EVERY_OTHER_DAY`, `WEEKLY`, `BIWEEKLY` or `MONTHLY`.
- `rotation` is the turn order, and the first person takes the first turn.
- `reminderHour` (0–23, default 18) means "remind the day before at this hour". It's stored, but reminders aren't sent yet.

`Chore`: `{ id, title, frequency, startsOn, allowSwaps, reminderHour, rotation: User[], comingUp: Turn[] }` (`comingUp` holds the next 3 turns).

`Turn`: `{ id, chore: { id, title, frequency }, dueOn, status, assignee: User, completedAt, completedBy: User|null, canSwap }`. `status` is one of `DONE`, `OVERDUE`, `DUE_TODAY` or `UPCOMING`, computed in the house's time zone.

**Calls each screen makes:**
- **Home, "Your chores today":** `GET /chore-assignments?from=<today>&to=<today>&assignee=me&includeOverdue=true`
- **Chores week view:** `GET /chore-assignments?from=<monday>&to=<sunday>&includeOverdue=true`. Split the results into "Yours" and "Everyone else" by `assignee.id`.
- **Done this month bars:** `GET /chores/stats`

**How edits work:**
- Changing the rotation makes the new first person go next.
- Changing the frequency or start date starts a new schedule; `startsOn` must be today or later.
- Finished and overdue turns are never rewritten.
- When someone moves out, the person after them in the rotation takes their turn.
- Anyone in the house can mark a turn done (covering for someone counts toward the person who did it). Only upcoming, unfinished turns of the same chore can be swapped, and you must hold one of them.

## Shopping list

| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/houses/:houseId/shopping-items` | `?category=GROCERIES\|HOUSEHOLD\|OTHER&status=NEEDED\|BOUGHT` | `{ needed: Item[], bought: Item[], billable: { itemIds, totalCents } }` |
| POST | `/houses/:houseId/shopping-items` | `{ name, category? }` | `201 { item }` |
| PATCH | `/houses/:houseId/shopping-items/:itemId` | `{ name?, category?, priceCents? }` | `{ item }` |
| DELETE | `/houses/:houseId/shopping-items/:itemId` | – | `204` |
| POST / DELETE | `/houses/:houseId/shopping-items/:itemId/claim` | – | `{ item }` ("I'll get it" / undo) |
| POST | `/houses/:houseId/shopping-items/:itemId/buy` | `{ priceCents? }` | `{ item }` |
| DELETE | `/houses/:houseId/shopping-items/:itemId/buy` | – | `{ item }` (undo) |

`Item`: `{ id, name, category, status, priceCents, boughtAt, billId, createdAt, updatedAt, addedBy: User, claimedBy: User|null, boughtBy: User|null }`

`bought` lists bought items that are either from the last 14 days or not on a bill yet, newest first. `billable` is what the "Split $14.77 as a bill" button will cover: items you bought and priced that aren't on a bill yet. The button itself comes with the bills feature.
