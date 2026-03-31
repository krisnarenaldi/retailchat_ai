"use client";

import { useChat } from "ai/react";
import { createClient } from "@/utils/supabase/client";
import { useEffect, useState, useRef } from "react";
import { LogOut, Send, Bot, User, Sparkles, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Chat() {
  const router = useRouter();
  const [limitExceeded, setLimitExceeded] = useState(false);
  const [limitMessage, setLimitMessage] = useState("");

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } =
    useChat({
      api: "/api/chat",
      fetch: async (input, init) => {
        const response = await fetch(input as RequestInfo, init);
        if (response.status === 403) {
          const text = await response.clone().text();
          setLimitExceeded(true);
          setLimitMessage(text);
        }
        return response;
      },
    });

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const supabase = createClient();
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUser(user);
      } else {
        router.push("/login");
      }
    };
    checkUser();
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-[#F9FAFB] text-gray-900 font-sans selection:bg-gray-200">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white/80 px-4 md:px-6 backdrop-blur-xl z-10 sticky top-0 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white ring-1 ring-gray-200 shadow-sm">
            <Sparkles className="h-4 w-4 text-emerald-600" />
          </div>
          <span className="font-medium text-sm text-gray-800">
            AI Workspace
          </span>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-xs text-gray-500 hidden sm:block">
            {user.email}
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            style={{ cursor: "pointer" }}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto w-full bg-[#F9FAFB]">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-4 space-y-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white ring-1 ring-gray-200 shadow-xl">
              <Sparkles className="h-8 w-8 text-emerald-500" />
            </div>
            <div className="space-y-2 max-w-md">
              <h2 className="text-2xl font-semibold text-gray-900">
                How can I help you today?
              </h2>
              <p className="text-sm text-gray-500">
                Note: You are limited to a configured number of interactions
                based on your usage plan.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col pb-24 pt-8">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex w-full px-4 py-6 md:px-0 ${
                  m.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`flex max-w-[85%] sm:max-w-2xl gap-4 ${
                    m.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <div className="shrink-0 flex items-start">
                    {m.role === "user" ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white ring-1 ring-gray-200 shadow-sm">
                        <User className="h-4 w-4 text-gray-500" />
                      </div>
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
                        <Bot className="h-4 w-4 text-emerald-600" />
                      </div>
                    )}
                  </div>
                  <div
                    className={`max-w-none text-[15px] leading-relaxed ${
                      m.role === "user"
                        ? "whitespace-pre-wrap bg-white px-5 py-3.5 rounded-2xl rounded-tr-sm text-gray-800 shadow-sm border border-gray-100"
                        : "text-gray-800 pt-1 prose prose-sm prose-gray max-w-none"
                    }`}
                  >
                    {m.role === "user" ? (
                      m.content
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-3">
                              <table className="w-full border-collapse text-sm">
                                {children}
                              </table>
                            </div>
                          ),
                          thead: ({ children }) => (
                            <thead className="bg-emerald-50">{children}</thead>
                          ),
                          th: ({ children }) => (
                            <th className="px-4 py-2 text-left font-semibold text-emerald-800 border border-gray-200 whitespace-nowrap">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="px-4 py-2 text-gray-700 border border-gray-200">
                              {children}
                            </td>
                          ),
                          tr: ({ children }) => (
                            <tr className="even:bg-gray-50 hover:bg-emerald-50/40 transition-colors">
                              {children}
                            </tr>
                          ),
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {limitExceeded && (
              <div className="mx-auto flex w-full max-w-3xl px-4 py-6 md:px-0">
                <div className="flex items-start space-x-3 rounded-xl bg-amber-50 p-4 border border-amber-200 text-amber-800 shadow-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-amber-500" />
                  <div className="text-sm leading-relaxed">
                    <p className="font-semibold mb-1">Usage limit reached</p>
                    <p>
                      {limitMessage ||
                        "You have reached your conversation limit. Please contact support to upgrade your plan."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {error && !limitExceeded && (
              <div className="mx-auto flex w-full max-w-3xl px-4 py-6 md:px-0">
                <div className="flex items-start space-x-3 rounded-xl bg-red-50 p-4 border border-red-100 text-red-700 shadow-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-red-500" />
                  <div className="text-sm leading-relaxed">
                    An error occurred while communicating with the AI. Please
                    try again.
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input Area */}
      <div className="sticky bottom-0 bg-gradient-to-t from-[#F9FAFB] via-[#F9FAFB]/90 to-transparent pb-6 pt-10 px-4">
        <div className="mx-auto w-full max-w-3xl">
          <form
            onSubmit={handleSubmit}
            className="flex relative items-end border border-gray-200 bg-white/80 backdrop-blur-xl rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] focus-within:ring-1 focus-within:ring-emerald-500/50 focus-within:border-emerald-500/50 transition-all"
          >
            <textarea
              className="w-full resize-none scrollbar-hide bg-transparent p-4 pr-16 text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              value={input}
              placeholder={
                limitExceeded
                  ? "You have reached your usage limit."
                  : "Message AI..."
              }
              onChange={handleInputChange}
              disabled={limitExceeded}
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim()) handleSubmit(e as any);
                }
              }}
              style={{
                minHeight: "60px",
                maxHeight: "200px",
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim() || limitExceeded}
              className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 transition-all hover:bg-emerald-100 disabled:opacity-40 disabled:hover:bg-emerald-50 shadow-sm"
            >
              <Send className="h-4 w-4 ml-0.5" />
            </button>
          </form>
          <div className="mt-3 text-center text-xs text-gray-400">
            AI can make mistakes. Consider verifying important information.
          </div>
        </div>
      </div>
    </div>
  );
}
