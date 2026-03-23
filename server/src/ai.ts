import { prisma } from './db.js';
import fs from 'fs';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const CHAT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const EMBEDDING_MODEL = 'text-embedding-3-small';
const OPENAI_URL = 'https://api.openai.com/v1';

function openaiHeaders() {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
  };
}

// --- Embedding ---

async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OPENAI_URL}/embeddings`, {
    method: 'POST',
    headers: openaiHeaders(),
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  const data = await res.json() as any;
  if (data.error) throw new Error(`Embedding error: ${data.error.message}`);
  return data.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// --- Document Chunking ---

function chunkText(text: string, chunkSize = 500, overlap = 100): { content: string; section: string | null; index: number }[] {
  // Try to split by section headers first
  const sectionRegex = /(?=(?:ARTICLE|Article|Section|SECTION)\s+[\dIVXLC]+)/gi;
  const sections = text.split(sectionRegex).filter(s => s.trim().length > 0);

  const chunks: { content: string; section: string | null; index: number }[] = [];
  let globalIndex = 0;

  for (const section of sections) {
    const sectionTitle = section.split('\n')[0]?.trim().slice(0, 100) || null;
    const words = section.split(/\s+/);

    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunkWords = words.slice(i, i + chunkSize);
      if (chunkWords.length < 20) continue; // Skip tiny chunks
      chunks.push({
        content: chunkWords.join(' '),
        section: sectionTitle,
        index: globalIndex++,
      });
    }
  }

  // If no sections were found, chunk the whole text
  if (chunks.length === 0) {
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunkWords = words.slice(i, i + chunkSize);
      if (chunkWords.length < 20) continue;
      chunks.push({ content: chunkWords.join(' '), section: null, index: globalIndex++ });
    }
  }

  return chunks;
}

// --- Index a document ---

export async function indexDocument(documentId: string, hoaId: string, filePath: string): Promise<number> {
  // Read file content
  let text: string;
  if (filePath.endsWith('.pdf')) {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const buffer = fs.readFileSync(filePath);
    const pdf = await pdfParse(buffer);
    text = pdf.text;
  } else {
    text = fs.readFileSync(filePath, 'utf-8');
  }

  // Delete existing chunks for this document
  await prisma.documentChunk.deleteMany({ where: { documentId } });

  // Chunk
  const chunks = chunkText(text);

  // Embed and store
  for (const chunk of chunks) {
    let embedding: number[] | null = null;
    try {
      embedding = await embed(chunk.content);
    } catch (e) {
      console.error('Embedding failed for chunk, storing without embedding:', e);
    }

    await prisma.documentChunk.create({
      data: {
        hoaId,
        documentId,
        content: chunk.content,
        section: chunk.section,
        chunkIndex: chunk.index,
        embedding: embedding ? JSON.stringify(embedding) : null,
      },
    });
  }

  return chunks.length;
}

// --- Search chunks ---

async function searchChunks(hoaId: string, query: string, topK = 5): Promise<{ content: string; section: string | null; score: number }[]> {
  const queryEmbedding = await embed(query);

  const chunks = await prisma.documentChunk.findMany({
    where: { hoaId, embedding: { not: null } },
  });

  const scored = chunks.map(chunk => ({
    content: chunk.content,
    section: chunk.section,
    score: cosineSimilarity(queryEmbedding, JSON.parse(chunk.embedding!)),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

// --- Chat with LLM ---

async function chatCompletion(messages: { role: string; content: string }[]): Promise<string> {
  const res = await fetch(`${OPENAI_URL}/chat/completions`, {
    method: 'POST',
    headers: openaiHeaders(),
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });
  const data = await res.json() as any;
  if (data.error) throw new Error(`Chat error: ${data.error.message}`);
  return data.choices[0].message.content;
}

// --- CC&R Chatbot ---

export async function askCCR(hoaId: string, question: string): Promise<{ answer: string; sources: { section: string | null; excerpt: string }[] }> {
  const relevantChunks = await searchChunks(hoaId, question, 5);

  if (relevantChunks.length === 0) {
    return {
      answer: 'I don\'t have any governing documents indexed for your HOA yet. Please upload your CC&Rs or bylaws in the Documents section first.',
      sources: [],
    };
  }

  const context = relevantChunks
    .map((c, i) => `[Source ${i + 1}${c.section ? ` - ${c.section}` : ''}]\n${c.content}`)
    .join('\n\n');

  const systemPrompt = `You are an HOA assistant that answers questions about the community's governing documents (CC&Rs, bylaws, rules).

RULES:
- Only answer based on the provided document excerpts
- Cite the specific section when possible
- If the documents don't cover the question, say so clearly
- Be concise and helpful
- Use plain language, not legal jargon`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Here are relevant excerpts from the HOA's governing documents:\n\n${context}\n\nQuestion: ${question}` },
  ];

  const answer = await chatCompletion(messages);

  const sources = relevantChunks
    .filter(c => c.score > 0.3)
    .map(c => ({
      section: c.section,
      excerpt: c.content.slice(0, 150) + '...',
    }));

  // Store chat history
  await prisma.chatMessage.create({ data: { hoaId, role: 'user', content: question } });
  await prisma.chatMessage.create({ data: { hoaId, role: 'assistant', content: answer } });

  return { answer, sources };
}

// --- AI Violation Notice ---

export async function generateViolationNotice(hoaId: string, violation: {
  unitAddress: string;
  ownerName: string;
  type: string;
  description: string;
  cureByDate?: string;
  fineAmount?: number;
  hoaName: string;
}): Promise<string> {
  // Try to find relevant CC&R sections
  let ccrContext = '';
  try {
    const chunks = await searchChunks(hoaId, `${violation.type} violation rules enforcement`, 3);
    if (chunks.length > 0) {
      ccrContext = `\n\nRelevant CC&R sections:\n${chunks.map(c => `[${c.section || 'General'}] ${c.content}`).join('\n\n')}`;
    }
  } catch (e) {
    // No embeddings available, proceed without
  }

  const prompt = `Generate a formal HOA violation notice letter with the following details:

HOA Name: ${violation.hoaName}
Property Address: ${violation.unitAddress}
Owner Name: ${violation.ownerName}
Violation Type: ${violation.type}
Description: ${violation.description}
${violation.cureByDate ? `Cure By Date: ${violation.cureByDate}` : ''}
${violation.fineAmount ? `Fine Amount: $${(violation.fineAmount / 100).toFixed(2)}` : ''}
${ccrContext}

Write a professional, firm but fair violation notice letter. Include:
1. Date and formal greeting
2. Clear description of the violation
3. Reference to relevant CC&R sections if available
4. Required corrective action
5. Cure deadline if provided
6. Fine information if applicable
7. Consequences of non-compliance
8. Contact information placeholder
9. Professional closing

Format as a complete letter ready to send.`;

  return chatCompletion([
    { role: 'system', content: 'You are a professional HOA management assistant. Write formal, legally appropriate letters.' },
    { role: 'user', content: prompt },
  ]);
}

// --- AI Meeting Minutes ---

export async function generateMeetingMinutes(rawNotes: string, hoaName: string): Promise<string> {
  const prompt = `Convert these raw meeting notes into properly formatted HOA board meeting minutes:

HOA: ${hoaName}
Raw Notes:
${rawNotes}

Format the minutes with:
1. Meeting header (HOA name, date if mentioned, "Board Meeting Minutes")
2. Attendees (if mentioned)
3. Call to Order
4. Each agenda item as a numbered section
5. Any motions made with who moved/seconded and vote results
6. Action items clearly listed with responsible parties
7. Next meeting date if mentioned
8. Adjournment

Use formal but readable language. If information is unclear, note it as "[to be confirmed]".`;

  return chatCompletion([
    { role: 'system', content: 'You are a professional HOA secretary. Format meeting notes into proper board meeting minutes.' },
    { role: 'user', content: prompt },
  ]);
}

// --- Get chat history ---

export async function getChatHistory(hoaId: string, limit = 20): Promise<{ role: string; content: string; createdAt: Date }[]> {
  return prisma.chatMessage.findMany({
    where: { hoaId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { role: true, content: true, createdAt: true },
  }).then(msgs => msgs.reverse());
}
