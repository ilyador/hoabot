import { z } from 'zod';
import { router, adminProcedure } from '../trpc.js';
import { askCCR, generateViolationNotice, generateMeetingMinutes, getChatHistory, indexDocument } from '../ai.js';
import { prisma } from '../db.js';
import { TRPCError } from '@trpc/server';

export const aiRouter = router({
  // Index a document for RAG
  indexDocument: adminProcedure
    .input(z.object({ documentId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const doc = await prisma.document.findFirst({
        where: { id: input.documentId, hoaId: ctx.hoaId },
      });
      if (!doc) throw new TRPCError({ code: 'NOT_FOUND' });

      try {
        const chunkCount = await indexDocument(doc.id, ctx.hoaId, doc.filePath);
        return { success: true, chunksCreated: chunkCount };
      } catch (err: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Indexing failed: ${err.message}` });
      }
    }),

  // Ask a question about CC&Rs
  askCCR: adminProcedure
    .input(z.object({ question: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await askCCR(ctx.hoaId, input.question);
      } catch (err: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `AI error: ${err.message}` });
      }
    }),

  // Get chat history
  chatHistory: adminProcedure.query(async ({ ctx }) => {
    return getChatHistory(ctx.hoaId);
  }),

  // Generate violation notice
  generateNotice: adminProcedure
    .input(z.object({ violationId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const violation = await prisma.violation.findFirst({
        where: { id: input.violationId, hoaId: ctx.hoaId },
        include: { unit: true, hoa: true },
      });
      if (!violation) throw new TRPCError({ code: 'NOT_FOUND' });

      try {
        const notice = await generateViolationNotice(ctx.hoaId, {
          unitAddress: violation.unit.address,
          ownerName: violation.unit.ownerName || 'Homeowner',
          type: violation.type,
          description: violation.description,
          cureByDate: violation.cureByDate?.toISOString().split('T')[0] || undefined,
          fineAmount: violation.fineAmount || undefined,
          hoaName: violation.hoa.name,
        });
        return { notice };
      } catch (err: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `AI error: ${err.message}` });
      }
    }),

  // Generate meeting minutes
  generateMinutes: adminProcedure
    .input(z.object({ rawNotes: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const hoa = await prisma.hoa.findUnique({ where: { id: ctx.hoaId } });
      if (!hoa) throw new TRPCError({ code: 'NOT_FOUND' });

      try {
        const minutes = await generateMeetingMinutes(input.rawNotes, hoa.name);
        return { minutes };
      } catch (err: any) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `AI error: ${err.message}` });
      }
    }),
});
