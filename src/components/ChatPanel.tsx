import React from 'react';
import { Send, Bot, User, Loader2, ShieldAlert } from 'lucide-react';
import { Message } from '../types';
import { chatWithClipsStream } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';

interface ChatPanelProps {
  clipsContent: string;
  activeContainerId: string;
  activeContainerName: string;
  activeContainerType: 'author' | 'topic';
}

export default function ChatPanel({ clipsContent, activeContainerName, activeContainerType }: ChatPanelProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  React.useEffect(() => {
    const handleInstantQA = (e: Event) => {
      const customEvent = e as CustomEvent<{ question: string; answer: string }>;
      if (customEvent.detail && customEvent.detail.question && customEvent.detail.answer) {
        const userMessage: Message = {
          id: Date.now().toString(),
          role: 'user',
          content: `[Instant Q&A Request] ${customEvent.detail.question}`,
          timestamp: Date.now()
        };
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: customEvent.detail.answer,
          timestamp: Date.now() + 1
        };
        setMessages((prev) => [...prev, userMessage, assistantMessage]);
      }
    };

    window.addEventListener('videoexplainer-instant-qa', handleInstantQA);
    window.addEventListener('clipbrain-instant-qa', handleInstantQA);
    return () => {
      window.removeEventListener('videoexplainer-instant-qa', handleInstantQA);
      window.removeEventListener('clipbrain-instant-qa', handleInstantQA);
    };
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (!clipsContent.trim()) {
      setError("Add some video or audio clips first so VideoExplainer has content to reference!");
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    const botMessageId = (Date.now() + 1).toString();
    const tempBotMessage: Message = {
      id: botMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now() + 1,
    };

    setMessages((prev) => [...prev, userMessage, tempBotMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      let accumulatedText = "";
      await chatWithClipsStream(
        [...messages, userMessage],
        clipsContent,
        activeContainerType,
        (chunk) => {
          accumulatedText += chunk;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === botMessageId ? { ...msg, content: accumulatedText } : msg
            )
          );
        }
      );
    } catch (err: any) {
      setError(err.message || "Something went wrong while communicating with VideoExplainer.");
      // Clear empty model responses upon failure
      setMessages((prev) => prev.filter((msg) => msg.id !== botMessageId || msg.content !== ''));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full lg:w-[450px] shrink-0 bg-white dark:bg-[#111111] border-l border-slate-200 dark:border-gray-800 flex flex-col h-full shadow-lg dark:shadow-2xl transition-colors duration-200">
      <div className="p-4 border-b border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-[#161616]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-600/20 flex items-center justify-center border border-blue-200 dark:border-blue-500/30 shrink-0">
            <Bot className="text-blue-600 dark:text-blue-400" size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-slate-900 dark:text-gray-200 truncate">
              {activeContainerType === 'author' ? `Explaining with ${activeContainerName}` : `Topic: ${activeContainerName}`}
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-gray-500 uppercase font-mono tracking-tight">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Grounded AI Explainer • Active
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-6 text-slate-500 dark:text-gray-500">
            <div className="p-4 rounded-2xl bg-slate-100 dark:bg-gray-800/50">
              <Bot size={36} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-gray-300">
                {activeContainerType === 'author' 
                  ? `Simulating ${activeContainerName}'s persona and domain insights.`
                  : `Subject matter explanations for ${activeContainerName}.`}
              </p>
              <p className="text-xs text-slate-500 dark:text-gray-500 mt-1">
                Ask questions to summarize videos, test concepts, or extract action steps.
              </p>
            </div>
          </div>
        )}
        <AnimatePresence>
          {messages.map((m) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                    : 'bg-slate-100 dark:bg-gray-800 text-slate-900 dark:text-gray-200 rounded-bl-none border border-slate-200 dark:border-gray-700 shadow-xs'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {m.role === 'user' ? (
                    <User size={12} className="opacity-80" />
                  ) : (
                    <Bot size={12} className="text-blue-600 dark:text-blue-400" />
                  )}
                  <span className="text-[10px] font-bold uppercase opacity-60">
                    {m.role === 'user' ? 'You' : 'Explainer AI'}
                  </span>
                </div>
                <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 dark:bg-gray-800 text-slate-800 dark:text-gray-200 rounded-2xl rounded-bl-none border border-slate-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 shadow-xs">
              <Loader2 className="animate-spin text-blue-600 dark:text-blue-400" size={18} />
              <span className="text-xs font-mono">Synthesizing knowledge base...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs flex gap-2 items-start">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-gray-800 bg-slate-50 dark:bg-[#161616]">
        <form onSubmit={handleSend} className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Ask VideoExplainer anything about your clips..."
            className="w-full bg-white dark:bg-gray-900 border border-slate-300 dark:border-gray-700 rounded-xl py-3 pl-4 pr-12 text-sm text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none shadow-xs"
            rows={2}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2.5 bottom-3.5 p-2 bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-gray-800 disabled:text-slate-400 dark:disabled:text-gray-600 text-white rounded-lg transition-all cursor-pointer shadow-xs"
            title="Send Message"
          >
            <Send size={16} />
          </button>
        </form>
        <div className="mt-2 text-[9px] text-slate-400 dark:text-gray-600 text-center uppercase tracking-widest font-bold">
          RAG-Optimized grounded query mode
        </div>
      </div>
    </div>
  );
}
