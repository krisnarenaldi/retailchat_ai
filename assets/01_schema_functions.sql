-- ============================================================
-- RetailChat AI — Full Migration
-- Schema + Seed Data (Sintetis)
-- Generated for: Toko Baju BajuKita
-- Period: Jan 2025 - Mar 2026
-- ============================================================

-- ============================================================
-- 1. SCHEMA
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  parent_id  INT REFERENCES categories(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  category    TEXT NOT NULL CHECK (category IN ('dewasa', 'anak')),
  size        TEXT NOT NULL,
  sku         TEXT NOT NULL UNIQUE,
  price       INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory
CREATE TABLE IF NOT EXISTS inventory (
  id          SERIAL PRIMARY KEY,
  product_id  INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stock_qty   INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id)
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  id          SERIAL PRIMARY KEY,
  product_id  INT NOT NULL REFERENCES products(id),
  quantity    INT NOT NULL,
  revenue     BIGINT NOT NULL,
  sold_at     TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT,
  role       TEXT DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage logs (for rate limiting)
CREATE TABLE IF NOT EXISTS usage_logs (
  id          SERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    TEXT DEFAULT '/api/chat',
  tokens_used INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sales_sold_at      ON sales(sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_product_id   ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_usage_user_date     ON usage_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_products_category   ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_slug       ON products(slug);

-- ============================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read product/inventory/sales data
CREATE POLICY "authenticated_read_products"   ON products   FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_inventory"  ON inventory  FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_sales"      ON sales      FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_categories" ON categories FOR SELECT TO authenticated USING (true);

-- Users can only see their own profile and usage
CREATE POLICY "own_profile"    ON profiles    FOR ALL TO authenticated USING (auth.uid() = id);
CREATE POLICY "own_usage_logs" ON usage_logs  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 3. SQL FUNCTIONS
-- ============================================================

-- Compare sales between two months
CREATE OR REPLACE FUNCTION compare_monthly_sales(
  p_current   TEXT,
  p_previous  TEXT,
  p_category  TEXT DEFAULT NULL,
  p_limit     INT  DEFAULT 10,
  p_direction TEXT DEFAULT 'declining'
)
RETURNS TABLE (
  product_name  TEXT,
  slug          TEXT,
  category      TEXT,
  current_qty   BIGINT,
  previous_qty  BIGINT,
  change_pct    NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.name,
    p.slug,
    p.category,
    COALESCE(SUM(CASE WHEN TO_CHAR(s.sold_at, 'YYYY-MM') = p_current  THEN s.quantity END), 0) AS current_qty,
    COALESCE(SUM(CASE WHEN TO_CHAR(s.sold_at, 'YYYY-MM') = p_previous THEN s.quantity END), 0) AS previous_qty,
    CASE
      WHEN COALESCE(SUM(CASE WHEN TO_CHAR(s.sold_at, 'YYYY-MM') = p_previous THEN s.quantity END), 0) = 0 THEN NULL
      ELSE ROUND(
        (SUM(CASE WHEN TO_CHAR(s.sold_at, 'YYYY-MM') = p_current  THEN s.quantity END)::NUMERIC -
         SUM(CASE WHEN TO_CHAR(s.sold_at, 'YYYY-MM') = p_previous THEN s.quantity END)::NUMERIC)
        / SUM(CASE WHEN TO_CHAR(s.sold_at, 'YYYY-MM') = p_previous THEN s.quantity END)::NUMERIC * 100, 1)
    END AS change_pct
  FROM sales s
  JOIN products p ON s.product_id = p.id
  WHERE (p_category IS NULL OR p_category = 'semua' OR p.category = p_category)
  GROUP BY p.id, p.name, p.slug, p.category
  HAVING
    CASE p_direction
      WHEN 'declining' THEN
        COALESCE(SUM(CASE WHEN TO_CHAR(s.sold_at, 'YYYY-MM') = p_current  THEN s.quantity END), 0) <
        COALESCE(SUM(CASE WHEN TO_CHAR(s.sold_at, 'YYYY-MM') = p_previous THEN s.quantity END), 0)
      WHEN 'growing' THEN
        COALESCE(SUM(CASE WHEN TO_CHAR(s.sold_at, 'YYYY-MM') = p_current  THEN s.quantity END), 0) >
        COALESCE(SUM(CASE WHEN TO_CHAR(s.sold_at, 'YYYY-MM') = p_previous THEN s.quantity END), 0)
      ELSE TRUE
    END
  ORDER BY change_pct ASC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get top products by qty or revenue
CREATE OR REPLACE FUNCTION get_top_products(
  p_period   TEXT,
  p_category TEXT DEFAULT NULL,
  p_metric   TEXT DEFAULT 'quantity',
  p_limit    INT  DEFAULT 10
)
RETURNS TABLE (
  product_name TEXT,
  slug         TEXT,
  category     TEXT,
  total_qty    BIGINT,
  total_revenue BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.name,
    p.slug,
    p.category,
    SUM(s.quantity)::BIGINT AS total_qty,
    SUM(s.revenue)::BIGINT  AS total_revenue
  FROM sales s
  JOIN products p ON s.product_id = p.id
  WHERE (
    (position('..' IN p_period) > 0 AND TO_CHAR(s.sold_at, 'YYYY-MM') BETWEEN split_part(p_period, '..', 1) AND split_part(p_period, '..', 2))
    OR (position('..' IN p_period) = 0 AND TO_CHAR(s.sold_at, 'YYYY-MM') = p_period)
  )
    AND (p_category IS NULL OR p_category = 'semua' OR p.category = p_category)
  GROUP BY p.id, p.name, p.slug, p.category
  ORDER BY
    CASE WHEN p_metric = 'revenue' THEN SUM(s.revenue) ELSE SUM(s.quantity) END DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Get revenue breakdown
CREATE OR REPLACE FUNCTION get_revenue_breakdown(
  p_period     TEXT,
  p_breakdown  TEXT DEFAULT 'category'
)
RETURNS TABLE (
  label         TEXT,
  total_revenue BIGINT,
  total_qty     BIGINT
) AS $$
BEGIN
  IF p_breakdown = 'category' THEN
    RETURN QUERY
    SELECT p.category::TEXT, SUM(s.revenue)::BIGINT, SUM(s.quantity)::BIGINT
    FROM sales s JOIN products p ON s.product_id = p.id
    WHERE (
      (position('..' IN p_period) > 0 AND TO_CHAR(s.sold_at, 'YYYY-MM') BETWEEN split_part(p_period, '..', 1) AND split_part(p_period, '..', 2))
      OR (position('..' IN p_period) = 0 AND TO_CHAR(s.sold_at, 'YYYY-MM') = p_period)
    )
    GROUP BY p.category ORDER BY SUM(s.revenue) DESC;
  ELSIF p_breakdown = 'product' THEN
    RETURN QUERY
    SELECT p.name::TEXT, SUM(s.revenue)::BIGINT, SUM(s.quantity)::BIGINT
    FROM sales s JOIN products p ON s.product_id = p.id
    WHERE (
      (position('..' IN p_period) > 0 AND TO_CHAR(s.sold_at, 'YYYY-MM') BETWEEN split_part(p_period, '..', 1) AND split_part(p_period, '..', 2))
      OR (position('..' IN p_period) = 0 AND TO_CHAR(s.sold_at, 'YYYY-MM') = p_period)
    )
    GROUP BY p.name ORDER BY SUM(s.revenue) DESC LIMIT 15;
  ELSIF p_breakdown = 'week' THEN
    RETURN QUERY
    SELECT TO_CHAR(DATE_TRUNC('week', s.sold_at), 'DD Mon')::TEXT,
           SUM(s.revenue)::BIGINT, SUM(s.quantity)::BIGINT
    FROM sales s
    WHERE (
      (position('..' IN p_period) > 0 AND TO_CHAR(s.sold_at, 'YYYY-MM') BETWEEN split_part(p_period, '..', 1) AND split_part(p_period, '..', 2))
      OR (position('..' IN p_period) = 0 AND TO_CHAR(s.sold_at, 'YYYY-MM') = p_period)
    )
    GROUP BY DATE_TRUNC('week', s.sold_at) ORDER BY DATE_TRUNC('week', s.sold_at);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Get low stock items
CREATE OR REPLACE FUNCTION get_low_stock_items(
  p_threshold INT  DEFAULT 10,
  p_category  TEXT DEFAULT NULL
)
RETURNS TABLE (
  product_name TEXT,
  slug         TEXT,
  category     TEXT,
  size         TEXT,
  stock_qty    INT,
  price        INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.name, p.slug, p.category, p.size, i.stock_qty, p.price
  FROM inventory i
  JOIN products p ON i.product_id = p.id
  WHERE i.stock_qty <= p_threshold
    AND (p_category IS NULL OR p_category = 'semua' OR p.category = p_category)
  ORDER BY i.stock_qty ASC, p.name;
END;
$$ LANGUAGE plpgsql;

-- Count user chat usage today (for rate limiting)
CREATE OR REPLACE FUNCTION count_user_usage_today(p_user_id UUID)
RETURNS INT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INT FROM usage_logs
    WHERE user_id = p_user_id
      AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Jakarta')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================