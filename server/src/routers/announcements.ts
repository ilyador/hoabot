import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';

export const announcementsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return prisma.announcement.findMany({
      where: { hoaId: ctx.hoaId },
      orderBy: { createdAt: 'desc' },
    });
  }),

  create: adminProcedure
    .input(z.object({
      title: z.string().min(1),
      body: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      return prisma.announcement.create({
        data: {
          hoaId: ctx.hoaId,
          title: input.title,
          body: input.body,
          authorId: ctx.userId,
        },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const ann = await prisma.announcement.findFirst({ where: { id: input.id, hoaId: ctx.hoaId } });
      if (!ann) throw new TRPCError({ code: 'NOT_FOUND' });
      await prisma.announcement.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
