import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';
import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const documentsRouter = router({
  list: adminProcedure
    .input(z.object({
      category: z.enum(['ccr', 'bylaws', 'minutes', 'budget', 'insurance', 'contract', 'other']).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const where: any = { hoaId: ctx.hoaId };
      if (input?.category) where.category = input.category;

      return prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const doc = await prisma.document.findFirst({ where: { id: input.id, hoaId: ctx.hoaId } });
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND' });

      // Delete associated document chunks (RAG data)
      await prisma.documentChunk.deleteMany({ where: { documentId: input.id } });

      // Delete file from disk
      try {
        if (fs.existsSync(doc.filePath)) {
          fs.unlinkSync(doc.filePath);
        }
      } catch (e) {
        // File might not exist, that's ok
      }

      await prisma.document.delete({ where: { id: input.id } });
      return { success: true };
    }),
});

export { UPLOAD_DIR };
