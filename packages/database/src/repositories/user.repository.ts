import { prisma } from '../client.js';

export interface UserInput {
  id: string;
  username: string;
  globalName?: string | null;
  avatarUrl?: string | null;
  bot?: boolean;
}

export const userRepository = {
  async upsert(input: UserInput) {
    const { id, ...rest } = input;
    if (!id) throw new Error('User-ID fehlt.');
    return prisma.user.upsert({
      where: { id },
      create: { id, ...rest, lastSeenAt: new Date() },
      update: { ...rest, lastSeenAt: new Date() },
    });
  },

  async get(userId: string) {
    return prisma.user.findUnique({ where: { id: userId } });
  },
};
