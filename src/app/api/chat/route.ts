import { createClient } from "@/utils/supabase/server";
import { streamText, tool, jsonSchema } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { RETAIL_TOOLS } from "@/lib/tools";

// Required for Edge/Node streaming depending on your setup
export const maxDuration = 30;

export async function POST(req: Request) {
  const supabase = await createClient();
  // x. setting prompot
  const today = new Date().toISOString().slice(0, 10); // format: YYYY-MM-DD
  const systemPrompt = `Tanggal hari ini adalah ${today}.
Kamu adalah asisten analitik untuk toko retail baju dewasa dan anak.
Kamu punya akses ke data penjualan dan stok inventaris. Selalu tampilkan angka dalam format Rupiah jika menyebut harga atau revenue.

ATURAN PENGGUNAAN TOOL:
1. Jika user bertanya tentang data penjualan atau stok produk, langsung panggil tool yang sesuai — jangan hanya narasi.
2. Setelah mendapat data dari tool (get_top_products, query_sales_comparison, get_revenue_breakdown, get_low_stock_items),
   selalu panggil generate_chart_config dengan data tersebut untuk membuat visualisasi chart.
3. Pilih chart_type yang tepat: "bar" untuk perbandingan produk, "line" untuk tren waktu, "pie" untuk proporsi/persentase.
4. Gunakan nama kolom yang benar dari data hasil tool untuk x_key dan y_key.
5. Jika pertanyaan tidak dapat dijawab dengan data penjualan atau stok, jawab dengan jelas:
   "Maaf, saya hanya bisa membantu dengan data penjualan dan stok produk. Silakan ajukan pertanyaan terkait penjualan, stok, kategori, atau produk."
6. Jangan mencoba menjawab pertanyaan yang di luar lingkup ini dengan spekulasi atau data yang tidak tersedia.
`;
  // a. Get user session
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // // user tidak login/ada session
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages } = await req.json();

  // b. Cek limit usage

  // // 1. Check Usage Config Limit
  const maxChats = parseInt(process.env.MAX_CHATS_PER_USER || "5", 10);

  // // 2. Query Usage from Supabase (count rows in usage_logs) — hanya hari ini
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count, error: usageError } = await supabase
    .from("usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", todayStart.toISOString());

  const currentChatCount = count || 0;

  if (currentChatCount >= maxChats) {
    return new Response(
      `You have reached your limit of ${maxChats} conversations. Please upgrade your account or contact support.`,
      { status: 403 },
    );
  }

  // 3. Initialize AI SDK Anthropics instance with specific API key handling if needed
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // 4. Record the Usage (Insert into usage_logs)
  const { error: insertError } = await supabase
    .from("usage_logs")
    .insert({ user_id: user.id });

  if (insertError) {
    console.error("Failed to insert usage log", insertError);
    // Log the error but continue
  }

  // 5. Build tools dari RETAIL_TOOLS + executeTool (agentic loop)
  const maxTokens = parseInt(process.env.MAX_OUTPUT_TOKENS || "4096", 10);

  const agentTools = Object.fromEntries(
    RETAIL_TOOLS.map((t) => [
      t.name,
      tool({
        description: t.description,
        parameters: jsonSchema(t.input_schema as any),
        execute: async (input) => executeTool(t.name, input, supabase),
      }),
    ]),
  );

  const result = await streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    system: systemPrompt,
    messages,
    tools: agentTools,
    maxSteps: 5,
    maxTokens,
  });

  // 6. Return Data Stream Response
  return result.toDataStreamResponse();
}

async function executeTool(
  name: string,
  input: any,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  console.log(`[tool] ${name}`, JSON.stringify(input));
  if (name === "get_schema") {
    return {
      tables: ["sales", "products", "inventory", "categories"],
      sales_columns: ["id", "product_id", "quantity", "revenue", "sold_at"],
    };
  }

  if (name === "query_sales_comparison") {
    const {
      current_month,
      previous_month,
      category,
      limit = 10,
      order = "asc",
    } = input;
    const { data, error } = await supabase.rpc("compare_monthly_sales", {
      p_current: current_month,
      p_previous: previous_month,
      p_category: category,
      p_limit: limit,
      p_direction: order,
    });
    if (error) throw new Error(error.message);
    return data;
  }

  if (name === "get_top_products") {
    let { period, category, metric, limit = 10 } = input;

    if (!period) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      period = `${year}-01..${year}-${month}`;
      console.log(`[tool] ${name} missing period, defaulting to`, period);
    }

    const { data, error } = await supabase.rpc("get_top_products", {
      p_period: period,
      p_category: category,
      p_metric: metric,
      p_limit: limit,
    });

    if (error) throw new Error(error.message);
    return data;
  }

  if (name === "get_revenue_breakdown") {
    let { period, breakdown, category = "semua" } = input;

    if (!period) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      period = `${year}-01..${year}-${month}`;
      console.log(`[tool] ${name} missing period, defaulting to`, period);
    }

    const { data, error } = await supabase.rpc("get_revenue_breakdown", {
      p_period: period,
      p_breakdown: breakdown,
      p_category: category,
    });

    if (error) throw new Error(error.message);
    return data;
  }

  if (name === "get_low_stock_items") {
    const { threshold = 10, category = "semua", product } = input;

    const { data, error } = await supabase.rpc("get_low_stock_items", {
      p_threshold: threshold,
      p_category: category,
    });

    if (error) throw new Error(error.message);

    if (product && Array.isArray(data)) {
      const normalizedProduct = String(product).toLowerCase();
      return data.filter((item: any) =>
        String(item.product_name).toLowerCase().includes(normalizedProduct),
      );
    }

    return data;
  }

  if (name === "generate_chart_config") {
    return { chart_config: input, status: "ready" };
  }

  console.warn(`[tool] unsupported tool "${name}" received`);
  return {
    message:
      "Maaf, tool yang diminta tidak tersedia. Silakan ajukan pertanyaan tentang data penjualan, stok, kategori, atau produk.",
  };
}
