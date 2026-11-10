/** What other roommates can see about a user. */
export const publicUserSelect = {
  id: true,
  netid: true,
  name: true,
  avatarUrl: true,
  presence: true,
} as const;

export const meSelect = {
  ...publicUserSelect,
  email: true,
  major: true,
  createdAt: true,
} as const;
