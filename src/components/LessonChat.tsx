import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type Msg = { role: 'user' | 'assistant'; content: string };

const STARTERS = [
  'Explain the key phrase in this lesson',
  'How do I pronounce it?',
  'Give me an example sentence',
];

// AI tutor chat about one lesson. Calls the lesson-chat Edge Function, which
// is account-gated (verify_jwt) and pulls the transcript server-side.
export default function LessonChat({
  videoId,
  language,
}: {
  videoId: string;
  language: string | null;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    const next: Msg[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setSending(true);
    setError(null);

    const { data, error: invokeErr } = await supabase.functions.invoke('lesson-chat', {
      body: { video_id: videoId, messages: next },
    });
    setSending(false);
    const res = data as { reply?: string; error?: string } | null;
    if (invokeErr || !res || res.error || !res.reply) {
      setError(res?.error ?? 'The tutor could not respond just now — please try again.');
      return;
    }
    setMessages((m) => [...m, { role: 'assistant', content: res.reply! }]);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center text-sm">
          ✦
        </span>
        <div>
          <p className="text-sm font-medium leading-tight">AI tutor</p>
          <p className="text-[11px] text-ink-400">
            Ask about this {language ?? ''} lesson
          </p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex flex-col gap-2.5 max-h-[22rem] overflow-y-auto pr-1"
      >
        {messages.length === 0 && (
          <div className="rounded-xl border border-paper-300/70 bg-paper-100/60 p-4">
            <p className="text-sm text-ink-600">
              Hi! I’m your tutor for this lesson. Ask me anything — vocabulary,
              grammar, pronunciation, or for examples.
            </p>
            <div className="flex flex-col gap-1.5 mt-3">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-left text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 hover:bg-emerald-100/70 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'self-end bg-ink-900 text-paper-50'
                : 'self-start bg-paper-50 border border-paper-300/70 text-ink-800 whitespace-pre-wrap'
            }`}
          >
            {m.content}
          </div>
        ))}

        {sending && (
          <div className="self-start bg-paper-50 border border-paper-300/70 rounded-2xl px-3.5 py-2.5">
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-ink-400 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-ink-400 animate-pulse [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-ink-400 animate-pulse [animation-delay:300ms]" />
            </span>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the tutor…"
          className="flex-1 rounded-xl border border-paper-300 bg-paper-50 px-3.5 py-2.5 text-sm focus:outline-none focus:border-ink-400"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 text-paper-50 text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
