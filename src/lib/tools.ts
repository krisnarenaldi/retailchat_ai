// tools.ts
export const RETAIL_TOOLS = [
  {
    name: "get_schema",
    description: "Ambil struktur tabel database untuk memahami kolom yang tersedia",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "query_sales_comparison",
    description: "Bandingkan penjualan item antara dua periode. Gunakan untuk analisis tren naik/turun.",
    input_schema: {
      type: "object",
      properties: {
        current_month: { type: "string", description: "Format YYYY-MM, bulan yang dianalisis" },
        previous_month: { type: "string", description: "Format YYYY-MM, bulan pembanding" },
        category: { type: "string", description: "Filter kategori: 'dewasa', 'anak', atau 'semua'" },
        limit: { type: "number", description: "Jumlah item yang ditampilkan" },
        order: { type: "string", enum: ["asc", "desc"], description: "asc = penurunan terbesar dulu" }
      },
      required: ["current_month", "previous_month"]
    }
  },
];