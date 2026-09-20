import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const quickQuestions = [
  'Xirmooyinka ugu jaban ii sheeg',
  'Hormuud package kee fiican?',
  'Unlimited data ma haysaan?',
];

const AiChat = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Salaan! Waxaan kaa caawin karaa xirmooyinka Riyokaab, qiimaha, shirkadaha, iyo doorashada package kugu habboon.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  const sendMessage = async (text = input) => {
    const question = text.trim();
    if (!question || isSending) return;

    setInput('');
    setIsSending(true);
    setMessages((prev) => [...prev, { role: 'user', content: question }]);

    try {
      const { data, error } = await supabase.functions.invoke('customer-ai-chat', {
        body: { message: question },
      });

      if (error) throw error;
      const answer = data?.answer || 'Waan ka xumahay, hadda jawaab lama helin. Fadlan mar kale isku day.';
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Waan ka xumahay, AI chat-ka hadda lama xiriiri karo. Fadlan internet-ka hubi kadibna mar kale isku day.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground" style={{ paddingTop: 'var(--effective-safe-area-top, 0px)' }}>
        <div className="h-16 px-4 flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-primary-foreground hover:bg-primary-foreground/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-10 h-10 rounded-full bg-primary-foreground/15 flex items-center justify-center">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold leading-tight">AI Chat</h1>
            <p className="text-xs text-primary-foreground/80">Riyokaab packages assistant</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-40">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-card border border-border text-card-foreground rounded-bl-md'}`}>
              {message.content}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">AI-ga ayaa jawaabaya...</span>
            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-4 pt-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {quickQuestions.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => sendMessage(question)}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-card-foreground"
            >
              {question}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Weydii xirmooyinka app-ka..."
            className="min-h-[48px] max-h-28 resize-none rounded-2xl"
          />
          <Button type="button" size="icon" disabled={!canSend} onClick={() => sendMessage()} className="h-12 w-12 rounded-full shrink-0">
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default AiChat;