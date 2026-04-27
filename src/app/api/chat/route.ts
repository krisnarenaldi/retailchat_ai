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
1. Jika user bertanya tentang data penjualan, stok produk, atau proyeksi pendapatan, langsung panggil tool yang sesuai — jangan hanya narasi.
2. Setelah mendapat data dari tool (get_top_products, query_sales_comparison, get_revenue_breakdown, get_low_stock_items, inventory_alerts, restock_recommendations, revenue_forecast),
   selalu panggil generate_chart_config dengan data tersebut untuk membuat visualisasi chart.
3. Pilih chart_type yang tepat: "bar" untuk perbandingan produk, "line" untuk tren waktu, "pie" untuk proporsi/persentase.
4. Gunakan nama kolom yang benar dari data hasil tool untuk x_key dan y_key.
5. Jika pertanyaan tidak dapat dijawab dengan data penjualan, stok, atau proyeksi pendapatan, jawab dengan jelas:
   "Maaf, saya hanya bisa membantu dengan data penjualan dan stok produk. Silakan ajukan pertanyaan terkait penjualan, stok, kategori, produk, atau proyeksi revenue."
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

  if (name === "inventory_alerts") {
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

  if (name === "restock_recommendations") {
    const {
      days_of_history = 30,
      target_days = 14,
      category = "semua",
      product,
    } = input;

    const salesStart = new Date();
    salesStart.setDate(salesStart.getDate() - Number(days_of_history));

    const [{ data: inventoryData, error: inventoryError }, { data: salesData, error: salesError }, { data: productsData, error: productsError }] =
      await Promise.all([
        supabase
          .from("inventory")
          .select("product_id,stock_qty,products(name,slug,category,size,price)"),
        supabase
          .from("sales")
          .select("product_id,quantity,sold_at")
          .gte("sold_at", salesStart.toISOString()),
        supabase
          .from("products")
          .select("id,name,slug,category,size,price"),
      ]);

    if (inventoryError || salesError || productsError)
      throw new Error(
        (inventoryError || salesError || productsError)?.message || "Failed to load restock recommendation data",
      );

    const productMap = new Map<number, any>(
      (productsData || []).map((productRow: any) => [productRow.id, productRow]),
    );

    const productFilter = product
      ? String(product).toLowerCase()
      : undefined;

    const recommendations = (inventoryData || [])
      .map((item: any) => {
        const productInfo = productMap.get(item.product_id) as any;
        if (!productInfo) return null;
        if (category !== "semua" && productInfo.category !== category) return null;
        if (
          productFilter &&
          !String(productInfo.name).toLowerCase().includes(productFilter)
        )
          return null;

        const soldQty = (salesData || [])
          .filter((sale: any) => sale.product_id === item.product_id)
          .reduce((sum: number, sale: any) => sum + Number(sale.quantity || 0), 0);

        const avgDailySales = soldQty / Math.max(1, Number(days_of_history));
        const desiredStock = Math.ceil(avgDailySales * Number(target_days));
        const recommendedOrder = Math.max(0, desiredStock - Number(item.stock_qty || 0));

        return {
          product_name: productInfo.name,
          slug: productInfo.slug,
          category: productInfo.category,
          size: productInfo.size,
          stock_qty: item.stock_qty,
          avg_daily_sales: Number(avgDailySales.toFixed(2)),
          target_days: Number(target_days),
          recommended_restock_qty: recommendedOrder,
        };
      })
      .filter(Boolean)
      .filter((item: any) => item.recommended_restock_qty > 0);

    return recommendations;
  }

  if (name === "revenue_forecast") {
    const { months_ahead = 1, category = "semua", product } = input;
    const historyMonths = 6;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - historyMonths);

    const [{ data: salesData, error: salesError }, { data: productsData, error: productsError }] =
      await Promise.all([
        supabase
          .from("sales")
          .select("product_id,revenue,sold_at" )
          .gte("sold_at", startDate.toISOString()),
        supabase
          .from("products")
          .select("id,name,slug,category,size,price"),
      ]);

    if (salesError || productsError)
      throw new Error(
        (salesError || productsError)?.message || "Failed to load revenue forecast data",
      );

    const productMap = new Map<number, any>(
      (productsData || []).map((productRow: any) => [productRow.id, productRow]),
    );

    const productFilter = product
      ? String(product).toLowerCase()
      : undefined;

    const monthlyRevenue = new Map<string, number>();

    (salesData || []).forEach((sale: any) => {
      const productInfo = productMap.get(sale.product_id);
      if (!productInfo) return;
      if (category !== "semua" && productInfo.category !== category) return;
      if (
        productFilter &&
        !String(productInfo.name).toLowerCase().includes(productFilter)
      )
        return;

      const monthKey = new Date(sale.sold_at).toISOString().slice(0, 7);
      monthlyRevenue.set(
        monthKey,
        (monthlyRevenue.get(monthKey) || 0) + Number(sale.revenue || 0),
      );
    });

    const monthKeys = Array.from(monthlyRevenue.keys()).sort();
    const historical = monthKeys.map((month) => ({
      month,
      revenue: monthlyRevenue.get(month) || 0,
    }));

    const revenueValues = historical.map((row) => row.revenue);
    const averageRevenue =
      revenueValues.reduce((sum, value) => sum + value, 0) /
      Math.max(1, revenueValues.length);

    const forecastMonth = new Date();
    forecastMonth.setMonth(forecastMonth.getMonth() + Number(months_ahead));
    const forecastKey = forecastMonth.toISOString().slice(0, 7);

    return [
      ...historical,
      {
        month: forecastKey,
        forecast_revenue: Math.round(averageRevenue),
      },
    ];
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
