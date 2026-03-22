import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';

export const unitsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return prisma.unit.findMany({
      where: { hoaId: ctx.hoaId },
      orderBy: { address: 'asc' },
    });
  }),

  get: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const unit = await prisma.unit.findFirst({
        where: { id: input.id, hoaId: ctx.hoaId },
      });
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND' });
      return unit;
    }),

  create: adminProcedure
    .input(z.object({
      address: z.string().min(1),
      lotNumber: z.string().optional(),
      ownerName: z.string().optional(),
      ownerEmail: z.string().email().optional().or(z.literal('')),
      ownerPhone: z.string().optional(),
      monthlyDues: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      return prisma.unit.create({
        data: {
          ...input,
          ownerEmail: input.ownerEmail || null,
          hoaId: ctx.hoaId,
        },
      });
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string(),
      address: z.string().min(1).optional(),
      lotNumber: z.string().optional(),
      ownerName: z.string().optional(),
      ownerEmail: z.string().email().optional().or(z.literal('')),
      ownerPhone: z.string().optional(),
      monthlyDues: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const unit = await prisma.unit.findFirst({ where: { id, hoaId: ctx.hoaId } });
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND' });
      return prisma.unit.update({ where: { id }, data: { ...data, ownerEmail: data.ownerEmail || null } });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const unit = await prisma.unit.findFirst({ where: { id: input.id, hoaId: ctx.hoaId } });
      if (!unit) throw new TRPCError({ code: 'NOT_FOUND' });
      await prisma.unit.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
