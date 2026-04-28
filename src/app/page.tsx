"use client";

import { useChat } from "ai/react";
import type { Message } from "ai";
import { createClient } from "@/utils/supabase/client";
import { useEffect, useState, useRef } from "react";
import { LogOut, Send, Bot, User, Sparkles, AlertCircle, Menu, X, MessageSquare, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const CHART_COLORS = [
  "#10b981",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

const exportSvgAsPng = async (svgElement: SVGSVGElement, filename: string) => {
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  // Function to inline computed styles into the SVG clone
  const inlineStyles = (source: Element, target: Element) => {
    const computed = window.getComputedStyle(source);
    // Comprehensive styles for SVG rendering
    const styleProps = [
      "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
      "font-family", "font-size", "font-weight", "text-anchor",
      "opacity", "visibility", "display", "stop-color", "stop-opacity", "filter", "clip-path"
    ];

    for (const prop of styleProps) {
      const value = computed.getPropertyValue(prop);
      // IMPORTANT: We must include "none" because SVG defaults some properties to black/visible
      if (value && value !== "normal") {
        target.setAttribute(prop, value);
      }
    }

    // Specific fix for text
    if (source.tagName.toLowerCase() === "text") {
      target.setAttribute("fill", computed.fill || "black");
    }

    for (let i = 0; i < source.children.length; i++) {
      inlineStyles(source.children[i], target.children[i]);
    }
  };

  inlineStyles(svgElement, clone);

  // Add a white background rectangle as the first element inside the SVG
  const rect = svgElement.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;

  const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bgRect.setAttribute("width", "100%");
  bgRect.setAttribute("height", "100%");
  bgRect.setAttribute("fill", "white");
  clone.insertBefore(bgRect, clone.firstChild);

  // Ensure namespaces and dimensions
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(clone);

  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const image = new Image();

  return new Promise<void>((resolve, reject) => {
    image.onload = () => {
      const canvas = document.createElement("canvas");
      // Use a consistent scale for high quality without being excessive
      const scale = 2;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error("Canvas context unavailable"));
      }

      // Draw white background on canvas as fallback
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.scale(scale, scale);
      ctx.drawImage(image, 0, 0, width, height);

      const pngData = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = pngData;
      link.download = filename;
      link.click();

      URL.revokeObjectURL(url);
      resolve();
    };
    image.onerror = (error) => {
      console.error("Image loading failed for PNG export:", error);
      URL.revokeObjectURL(url);
      reject(error);
    };
    image.src = url;
  });
};

const exportTableToCsv = (table: HTMLTableElement, filename: string) => {
  const rows = Array.from(table.querySelectorAll("tr"));
  const csv = rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll("th, td"));
      return cells
        .map((cell) => `"${(cell.textContent || "").trim().replace(/"/g, '""')}"`)
        .join(",");
    })
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const SUGGESTIONS = [
  "Bandingkan penjualan bulan ini vs bulan lalu",
  "Tampilkan top 5 produk kategori anak",
  "Top products by revenue vs quantity",
  "Breakdown revenue per produk bulan ini"
];

type ChartConfig = {
  chart_type: "bar" | "line" | "pie";
  data: Record<string, unknown>[];
  title: string;
  x_key: string;
  y_key: string;
};

type ChatSession = {
  id: string;
  title: string;
  createdAt: number;
  messages: Message[];
};

function RetailChart({ config }: { config: ChartConfig }) {
  const { chart_type, data, title, x_key, y_key } = config;
  const chartRef = useRef<HTMLDivElement>(null);
  if (!data || data.length === 0) return null;

  const handleExportChart = async () => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;
    await exportSvgAsPng(svg as SVGSVGElement, `${title}.png`);
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        <button
          type="button"
          onClick={handleExportChart}
          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
        >
          Export PNG
        </button>
      </div>
      <div ref={chartRef}>
        <ResponsiveContainer width="100%" height={260}>
          {chart_type === "pie" ? (
            <PieChart>
              <Pie
                data={data}
                dataKey={y_key}
                nameKey={x_key}
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, percent }) =>
                  `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : chart_type === "line" ? (
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey={x_key}
                tick={{ fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey={y_key}
                stroke={CHART_COLORS[0]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey={x_key}
                tick={{ fontSize: 11 }}
                interval={0}
                angle={data.length > 6 ? -30 : 0}
                textAnchor={data.length > 6 ? "end" : "middle"}
                height={data.length > 6 ? 50 : 30}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey={y_key} radius={[4, 4, 0, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MarkdownTable({ children }: { children?: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleExportCsv = () => {
    const table = wrapperRef.current?.querySelector("table");
    if (table) {
      exportTableToCsv(table as HTMLTableElement, "table-data.csv");
    }
  };

  return (
    <div className="overflow-x-auto my-3" ref={wrapperRef}>
      <div className="flex justify-end mb-2">
        <button
          type="button"
          onClick={handleExportCsv}
          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export default function Chat() {
  const router = useRouter();
  const [limitExceeded, setLimitExceeded] = useState(false);
  const [limitMessage, setLimitMessage] = useState("");

  // Sidebar & Session State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  // Initialize session ID only on client to avoid hydration mismatch
  useEffect(() => {
    setCurrentSessionId(`chat_${Date.now()}`);
  }, []);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages, append } =
    useChat({
      api: "/api/chat",
      id: currentSessionId,
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
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load sessions from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem("retail_chat_sessions");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSessions(parsed);
      } catch (e) {
        console.error("Failed to parse sessions", e);
      }
    }
  }, []);

  // Save to local storage whenever messages change
  useEffect(() => {
    if (messages.length > 0 && currentSessionId) {
      setSessions((prev) => {
        const existingIndex = prev.findIndex((s) => s.id === currentSessionId);
        let newSessions = [...prev];
        if (existingIndex >= 0) {
          newSessions[existingIndex] = {
            ...newSessions[existingIndex],
            messages,
          };
        } else {
          // Create title from first user message
          const firstUserMsg = messages.find(m => m.role === 'user')?.content || "New Chat";
          const title = firstUserMsg;
          newSessions = [
            { id: currentSessionId, title, createdAt: Date.now(), messages },
            ...prev,
          ];
        }
        localStorage.setItem("retail_chat_sessions", JSON.stringify(newSessions));
        return newSessions;
      });
    }
  }, [messages, currentSessionId]);

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
      setIsAuthLoading(false);
    };
    checkUser();
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const confirmLogout = () => {
    setIsLogoutModalOpen(false);
    void handleLogout();
  };

  const handleExportPdf = () => {
    window.print();
  };

  const handleNewChat = () => {
    setCurrentSessionId(`chat_${Date.now()}`);
    setMessages([]);
    setLimitExceeded(false);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleSelectSession = (id: string) => {
    const session = sessions.find((s) => s.id === id);
    if (session) {
      setCurrentSessionId(id);
      setMessages(session.messages);
      setLimitExceeded(false);
    }
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleSuggestionClick = (suggestion: string) => {
    append({ role: "user", content: suggestion });
  };

  if (isAuthLoading) {
    return (
      <div className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-[#FAFBFC] text-slate-900">
        <div className="absolute -top-[10%] -left-[10%] h-[40%] w-[40%] rounded-full bg-emerald-500/5 blur-[120px] animate-pulse" />
        <div className="absolute -bottom-[10%] -right-[10%] h-[40%] w-[40%] rounded-full bg-blue-500/5 blur-[120px]" />

        <div className="relative z-10 flex flex-col items-center gap-6 rounded-[2.5rem] border border-slate-200/60 bg-white/70 p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.06)] backdrop-blur-3xl transition-all duration-500 animate-in fade-in zoom-in-95">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 ring-1 ring-emerald-100/50 shadow-inner">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-emerald-600 border-t-transparent" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-xl font-bold tracking-tight text-slate-800">Menyiapkan Workspace...</p>
            <p className="text-sm font-medium text-slate-500">Memverifikasi sesi aman Anda.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user || !currentSessionId) {
    return null;
  }

  return (
    <div className="flex h-screen w-full bg-[#F9FAFB] text-gray-900 font-sans selection:bg-gray-200 overflow-hidden">
      {/* Sidebar Overlay (Mobile) */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-72 bg-white/90 border-r border-slate-200/60 backdrop-blur-2xl transform transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] md:relative md:translate-x-0 flex flex-col print-hidden ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="p-6 border-b border-slate-100/50 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 shadow-lg shadow-emerald-200/50">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-[17px] tracking-tight text-slate-800 uppercase">
              Sales Analytics
            </span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
            style={{ cursor: "pointer" }}
          >
            <Plus className="h-4 w-4" />
            <span>New Chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="px-2 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            History
          </div>
          {sessions.length === 0 ? (
            <div className="px-2 py-4 text-sm text-gray-500 text-center">
              No chat history
            </div>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="relative group/tooltip">
                <button
                  onClick={() => handleSelectSession(session.id)}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${currentSessionId === session.id
                    ? "bg-emerald-50 text-emerald-800 font-medium"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  style={{ cursor: "pointer" }}
                >
                  <MessageSquare className={`h-4 w-4 shrink-0 ${currentSessionId === session.id ? 'text-emerald-600' : 'text-gray-400'}`} />
                  <span className="truncate">{session.title}</span>
                </button>
                
                {session.title.length > 25 && (
                  <div className="absolute left-8 right-2 top-full mt-1 z-50 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 pointer-events-none">
                    <div className="relative bg-slate-800 text-white text-[11.5px] font-medium py-2 px-3 rounded-md shadow-lg leading-relaxed whitespace-normal break-words">
                      <div className="absolute left-4 -top-1 w-2 h-2 bg-slate-800 rotate-45" />
                      <span className="relative z-10">{session.title}</span>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt={user.user_metadata.full_name || "Profile"}
                  className="h-8 w-8 rounded-full border border-gray-200"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center">
                  <User className="h-4 w-4 text-slate-500" />
                </div>
              )}
              <div className="truncate flex flex-col">
                <span className="text-xs font-bold text-gray-800 truncate">
                  {user.user_metadata?.full_name || "User"}
                </span>
                <span className="text-[10px] text-gray-500 truncate">
                  {user.email}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsLogoutModalOpen(true)}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
              title="Sign out"
              style={{ cursor: "pointer" }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/60 bg-white/70 px-4 md:px-8 backdrop-blur-3xl z-10 sticky top-0 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] print-hidden">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-100/80 rounded-xl transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-sm text-slate-600 tracking-tight">
                Analytic Workspace
              </span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <button
              type="button"
              onClick={handleExportPdf}
              className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
            >
              Export PDF
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
              >
                {user.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt="Profile"
                    className="h-5 w-5 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-5 w-5 rounded-lg bg-slate-100 flex items-center justify-center">
                    <User className="h-3.5 w-3.5 text-slate-500" />
                  </div>
                )}
                Profile
              </button>
              {isProfileMenuOpen && (
                <div className="absolute right-0 mt-3 w-56 rounded-[1.5rem] border border-slate-200/60 bg-white/80 p-1.5 shadow-[0_12px_24px_-8px_rgba(0,0,0,0.12)] backdrop-blur-2xl animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Akun Anda
                  </div>
                  <div className="px-3 flex flex-col gap-0.5 pb-3">
                    <span className="text-sm font-bold text-slate-800">
                      {user.user_metadata?.full_name || "User"}
                    </span>
                    <span className="text-xs font-medium text-slate-500 truncate">
                      {user.email}
                    </span>
                  </div>
                  <div className="border-t border-slate-100 my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      setIsLogoutModalOpen(true);
                    }}
                    className="w-full px-3 py-2.5 text-left text-sm font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto w-full">
          {messages.length === 0 ? (
            <div className="flex min-h-full flex-col items-center justify-center text-center px-4 space-y-8 max-w-3xl mx-auto py-12 pb-32">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 ring-1 ring-emerald-100 shadow-sm">
                <Sparkles className="h-10 w-10 text-emerald-600" />
              </div>
              <div className="space-y-3">
                <h2 className="text-3xl font-semibold text-gray-900">Selamat datang di AI Retail</h2>
                <p className="text-sm text-gray-600 max-w-2xl mx-auto">
                  Saya siap membantu Anda dengan analisis penjualan, stok, dan proyeksi revenue. Cukup pilih salah satu ide di bawah atau ketik pertanyaan Anda.
                </p>
              </div>

              <div className="grid gap-6 sm:grid-cols-2 w-full max-w-3xl">
                <div className="rounded-[2rem] border border-slate-200/60 bg-white/60 p-6 text-left shadow-sm backdrop-blur-sm transition-all hover:shadow-md">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-4">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-slate-900 uppercase tracking-tight">Analisis Cerdas</p>
                  <p className="mt-2 text-sm text-slate-500 leading-relaxed">Bandingkan penjualan, tampilkan produk stok rendah, dan proyeksikan revenue dengan bahasa alami.</p>
                </div>
                <div className="rounded-[2rem] border border-slate-200/60 bg-white/60 p-6 text-left shadow-sm backdrop-blur-sm transition-all hover:shadow-md">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-4">
                    <Bot className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-slate-900 uppercase tracking-tight">Eksplorasi Data</p>
                  <p className="mt-2 text-sm text-slate-500 leading-relaxed">Gunakan contoh di bawah atau ketik pertanyaan spesifik untuk mendapatkan insight instan dari database Anda.</p>
                </div>
              </div>

              {/* Suggestion Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg mt-4">
                {SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="text-left px-4 py-3 rounded-xl border border-gray-200 bg-white hover:border-emerald-300 hover:shadow-md hover:bg-emerald-50/30 transition-all text-sm text-gray-700 shadow-sm"
                    style={{ cursor: "pointer" }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col pb-32 pt-8">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex w-full px-4 py-6 md:px-0 ${m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                >
                  <div
                    className={`flex max-w-[85%] sm:max-w-2xl gap-4 ${m.role === "user" ? "flex-row-reverse" : "flex-row"
                      }`}
                  >
                    <div className="shrink-0 flex items-start">
                      {m.role === "user" ? (
                        user.user_metadata?.avatar_url ? (
                          <img
                            src={user.user_metadata.avatar_url}
                            alt="You"
                            className="h-8 w-8 rounded-full border border-gray-200 shadow-sm"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white ring-1 ring-gray-200 shadow-sm">
                            <User className="h-4 w-4 text-gray-500" />
                          </div>
                        )
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
                          <Bot className="h-4 w-4 text-emerald-600" />
                        </div>
                      )}
                    </div>
                    <div
                      className={`max-w-none text-[15px] leading-relaxed ${m.role === "user"
                        ? "whitespace-pre-wrap bg-white px-5 py-3.5 rounded-2xl rounded-tr-sm text-gray-800 shadow-sm border border-gray-100"
                        : "text-gray-800 pt-1 prose prose-sm prose-gray max-w-none"
                        }`}
                    >
                      {m.role === "user" ? (
                        m.content
                      ) : (
                        <>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              table: MarkdownTable,
                              thead: ({ children }) => (
                                <thead className="bg-emerald-50">
                                  {children}
                                </thead>
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
                          {m.toolInvocations
                            ?.filter(
                              (inv) =>
                                inv.toolName === "generate_chart_config" &&
                                inv.state === "result",
                            )
                            .map((inv, i) => (
                              <RetailChart
                                key={i}
                                config={
                                  (
                                    inv as {
                                      result: { chart_config: ChartConfig };
                                    }
                                  ).result.chart_config
                                }
                              />
                            ))}
                        </>
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
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#F9FAFB] via-[#F9FAFB]/95 to-transparent pb-6 pt-12 px-4 z-10 print-hidden">
          <div className="mx-auto w-full max-w-3xl relative">
            <form
              onSubmit={handleSubmit}
              className="flex relative items-end border border-gray-200 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all"
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
                disabled={limitExceeded || isLoading}
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
                className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white transition-all hover:bg-emerald-700 disabled:opacity-40 shadow-sm"
                style={{ cursor: "pointer" }}
              >
                <Send className="h-4 w-4 ml-0.5" />
              </button>
            </form>
            <div className="mt-3 text-center text-[11px] text-gray-400">
              AI can make mistakes. Consider verifying important information.
            </div>
          </div>
        </div>
      </div>

      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-black/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Confirm Logout</h2>
                <p className="mt-2 text-sm text-gray-600">
                  Are you sure you want to sign out? Your current session will end and you will be redirected to the login page.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(false)}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close logout confirmation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(false)}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

