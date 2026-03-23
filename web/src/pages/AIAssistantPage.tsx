import { useState } from 'react';
import { trpc } from '../trpc';
import { useToast } from '../components/Toast';

export function AIAssistantPage() {
  const [activeTab, setActiveTab] = useState<'chat' | 'notice' | 'minutes'>('chat');

  const tabDescriptions: Record<string, string> = {
    chat: 'Ask questions about your CC&Rs and governing documents. The AI will search indexed documents to provide accurate answers with source citations.',
    notice: 'Automatically generate formal violation notice letters based on reported violations. You can edit the letter before sending it via email.',
    minutes: 'Paste your raw meeting notes and the AI will format them into professional meeting minutes with motions, votes, and action items.',
  };

  return (
    <div>
      <h1 className="mb-5">AI Assistant</h1>

      <div className="flex gap-1.5 mb-2">
        {[
          { id: 'chat' as const, label: 'CC&R Chatbot' },
          { id: 'notice' as const, label: 'Violation Notice' },
          { id: 'minutes' as const, label: 'Meeting Minutes' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-[13px] mb-5" style={{ color: 'var(--text-secondary)' }}>
        {tabDescriptions[activeTab]}
      </p>

      {activeTab === 'chat' && <CCRChat />}
      {activeTab === 'notice' && <ViolationNoticeGenerator />}
      {activeTab === 'minutes' && <MeetingMinutesGenerator />}
    </div>
  );
}

function CCRChat() {
  const { toast } = useToast();
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string; sources?: any[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const { data: documents } = trpc.documents.list.useQuery({ category: 'ccr' });
  const indexDoc = trpc.ai.indexDocument.useMutation();
  const askCCR = trpc.ai.askCCR.useMutation();

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || loading) return;
    const q = question;
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const result = await askCCR.mutateAsync({ question: q });
      setMessages(prev => [...prev, { role: 'assistant', content: result.answer, sources: result.sources }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally { setLoading(false); }
  }

  async function handleIndex(docId: string) {
    try {
      const result = await indexDoc.mutateAsync({ documentId: docId });
      toast(`Document indexed: ${result.chunksCreated} chunks created`);
    } catch (err: any) { toast(`Indexing failed: ${err.message}`, 'error'); }
  }

  const hasCCRDocuments = documents && documents.length > 0;

  return (
    <div className="space-y-3">
      {!hasCCRDocuments && (
        <div className="card p-4" style={{ background: 'var(--warning-muted)', border: '1px solid var(--warning)20' }}>
          <div className="flex items-start gap-3">
            <span className="text-[18px]">!</span>
            <div>
              <div className="text-[13px] font-semibold" style={{ color: 'var(--warning)' }}>No CC&R documents indexed</div>
              <p className="text-[12px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                Upload your CC&R documents on the <a href="/documents" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Documents page</a> first, then return here to index them for AI search. Without indexed documents, the chatbot cannot answer questions.
              </p>
            </div>
          </div>
        </div>
      )}

      {hasCCRDocuments && (
        <div className="card p-3">
          <div className="text-[12px] font-medium mb-2" style={{ color: 'var(--text-tertiary)' }}>CC&R Documents (click to index for AI)</div>
          <div className="flex gap-2 flex-wrap">
            {documents.map((doc: any) => (
              <button key={doc.id} onClick={() => handleIndex(doc.id)} disabled={indexDoc.isPending} className="btn btn-secondary btn-sm">
                {indexDoc.isPending ? 'Indexing...' : `Index: ${doc.name}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4 min-h-[300px] max-h-[460px] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
            <div className="text-[32px] mb-2 opacity-50">💬</div>
            <div className="text-[14px]">Ask a question about your HOA's governing documents.</div>
            {!hasCCRDocuments && (
              <div className="text-[12px] mt-2" style={{ color: 'var(--warning)' }}>Upload CC&R documents in the Documents page first, then index them here.</div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] rounded-[8px] px-3.5 py-2.5" style={{
                  background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-primary)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                }}>
                  <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{msg.content}</div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <div className="text-[11px] font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Sources:</div>
                      {msg.sources.map((s: any, j: number) => (
                        <div key={j} className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>
                          {s.section || 'Document'}: {s.excerpt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-[8px] px-3.5 py-2.5 text-[13px]" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                  Thinking...
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleAsk} className="flex gap-2">
        <input type="text" value={question} onChange={e => setQuestion(e.target.value)} className="input flex-1"
          placeholder="Ask about your CC&Rs... e.g., 'Can I build a fence?'" disabled={loading} />
        <button type="submit" disabled={loading || !question.trim()} className="btn btn-primary">Ask</button>
      </form>
    </div>
  );
}

function ViolationNoticeGenerator() {
  const { toast } = useToast();
  const { data: violations } = trpc.violations.list.useQuery();
  const generateNotice = trpc.ai.generateNotice.useMutation();
  const sendNotice = trpc.email.sendViolationNotice.useMutation();
  const [selectedId, setSelectedId] = useState('');
  const [notice, setNotice] = useState('');

  const openViolations = violations?.filter((v: any) => v.status !== 'resolved') || [];

  return (
    <div className="card p-4">
      <h3 className="mb-3">Generate Violation Notice</h3>
      <div className="flex gap-3 items-end mb-4">
        <div className="flex-1">
          <label className="label">Select Violation</label>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="input">
            <option value="">Choose a violation...</option>
            {openViolations.map((v: any) => (
              <option key={v.id} value={v.id}>{v.unit.address} — {v.type}</option>
            ))}
          </select>
        </div>
        <button onClick={async () => { if (!selectedId) return; try { const r = await generateNotice.mutateAsync({ violationId: selectedId }); setNotice(r.notice); } catch (err: any) { toast(err.message, 'error'); } }}
          disabled={!selectedId || generateNotice.isPending} className="btn btn-primary">
          {generateNotice.isPending ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {notice && (
        <div>
          <label className="label">Generated Notice (editable)</label>
          <textarea value={notice} onChange={e => setNotice(e.target.value)} rows={12} className="input font-mono text-[12px]" />
          <div className="flex gap-2 mt-3">
            <button onClick={async () => { try { const r = await sendNotice.mutateAsync({ violationId: selectedId, noticeText: notice }); toast(r.sent ? 'Notice sent!' : (r.error || 'Send failed'), r.sent ? 'success' : 'error'); } catch (err: any) { toast(err.message, 'error'); } }}
              disabled={sendNotice.isPending} className="btn btn-primary btn-sm">
              {sendNotice.isPending ? 'Sending...' : 'Send via Email'}
            </button>
            <button onClick={() => navigator.clipboard.writeText(notice)} className="btn btn-secondary btn-sm">Copy</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MeetingMinutesGenerator() {
  const { toast } = useToast();
  const [rawNotes, setRawNotes] = useState('');
  const [minutes, setMinutes] = useState('');
  const generateMinutes = trpc.ai.generateMinutes.useMutation();

  return (
    <div className="card p-4">
      <h3 className="mb-3">Meeting Minutes Generator</h3>
      <form onSubmit={async e => { e.preventDefault(); if (!rawNotes.trim()) return; try { const r = await generateMinutes.mutateAsync({ rawNotes }); setMinutes(r.minutes); } catch (err: any) { toast(err.message, 'error'); } }}>
        <div className="mb-3">
          <label className="label">Paste Raw Meeting Notes</label>
          <textarea value={rawNotes} onChange={e => setRawNotes(e.target.value)} rows={6} className="input"
            placeholder={"Example:\nMeeting called to order at 7:00 PM by President Jane Smith.\nBoard members present: Jane Smith, John Doe, Sarah Lee.\n\n1. Pool maintenance contract — renewed with AquaCare for $12,000/year. Motion by John, seconded by Sarah. Passed 3-0.\n2. Parking enforcement — new towing policy effective May 1. Warnings to be sent first.\n3. Budget review — Q1 spending on track. Reserve fund at $45,000.\n\nMeeting adjourned at 8:15 PM. Next meeting: April 15."} />
        </div>
        <button type="submit" disabled={generateMinutes.isPending || !rawNotes.trim()} className="btn btn-primary">
          {generateMinutes.isPending ? 'Generating...' : 'Generate Minutes'}
        </button>
      </form>

      {minutes && (
        <div className="mt-4">
          <label className="label">Generated Minutes (editable)</label>
          <textarea value={minutes} onChange={e => setMinutes(e.target.value)} rows={12} className="input font-mono text-[12px]" />
          <div className="mt-3">
            <button onClick={() => navigator.clipboard.writeText(minutes)} className="btn btn-secondary btn-sm">Copy to Clipboard</button>
          </div>
        </div>
      )}
    </div>
  );
}
