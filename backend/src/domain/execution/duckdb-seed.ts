export const SEED_STATEMENTS = [
  `CREATE OR REPLACE TABLE customers AS
   SELECT
     i AS customer_id,
     CASE (i * 7) % 12
       WHEN 0 THEN 'Acme' WHEN 1 THEN 'Trellis' WHEN 2 THEN 'Summit' WHEN 3 THEN 'Kite'
       WHEN 4 THEN 'Morrow' WHEN 5 THEN 'Northwind' WHEN 6 THEN 'Lumen' WHEN 7 THEN 'Harbor'
       WHEN 8 THEN 'Vertex' WHEN 9 THEN 'Cobalt' WHEN 10 THEN 'Redwood' ELSE 'Meridian'
     END || ' ' ||
     CASE (i * 5) % 6
       WHEN 0 THEN 'Labs' WHEN 1 THEN 'Health' WHEN 2 THEN 'Retail'
       WHEN 3 THEN 'Systems' WHEN 4 THEN 'Finance' ELSE 'Group'
     END || ' ' || CAST(i AS VARCHAR) AS company_name,
     CASE (i % 3) WHEN 0 THEN 'enterprise' WHEN 1 THEN 'mid_market' ELSE 'startup' END AS segment
   FROM range(1, 401) t(i)`,

  `CREATE OR REPLACE TABLE products AS
   SELECT
     i AS product_id,
     CASE (i * 3) % 8
       WHEN 0 THEN 'Signal Pro' WHEN 1 THEN 'Relay' WHEN 2 THEN 'Northstar API' WHEN 3 THEN 'Atlas'
       WHEN 4 THEN 'Beacon' WHEN 5 THEN 'Conduit' WHEN 6 THEN 'Prism' ELSE 'Quarry'
     END || ' ' || CAST(i AS VARCHAR) AS product_name,
     CASE (i % 3) WHEN 0 THEN 'platform' WHEN 1 THEN 'services' ELSE 'data' END AS category
   FROM range(1, 429) t(i)`,

  `CREATE OR REPLACE TABLE orders AS
   SELECT
     100000 + i AS order_id,
     1 + ((i * 37) % 400) AS customer_id,
     TIMESTAMP '2025-01-01 00:00:00'
       + INTERVAL 1 DAY * ((i * 11) % 730)
       + INTERVAL 1 HOUR * ((i * 7) % 24) AS ordered_at,
     CAST(ROUND(
       (40 + ((i * 97) % 9000) / 10.0 + ((i % 17) * 23))
       * CASE (1 + ((i * 37) % 400)) % 3 WHEN 0 THEN 2.6 WHEN 1 THEN 1.4 ELSE 0.9 END
       * (1 + ((i * 11) % 730) / 1400.0),
     2) AS DECIMAL(12,2)) AS net_revenue,
     CASE (i % 11)
       WHEN 0 THEN 'refunded' WHEN 1 THEN 'pending' WHEN 2 THEN 'cancelled'
       WHEN 3 THEN 'fulfilled' ELSE 'paid'
     END AS status
   FROM range(1, 20001) t(i)`,

  `CREATE OR REPLACE TABLE subscriptions AS
   SELECT
     8800 + i AS subscription_id,
     1 + ((i * 53) % 400) AS customer_id,
     CAST(ROUND(29 + ((i * 131) % 11970) / 10.0, 2) AS DECIMAL(12,2)) AS mrr
   FROM range(1, 9103) t(i)`,

  `CREATE OR REPLACE TABLE events AS
   SELECT
     CASE (i % 6)
       WHEN 0 THEN 'activated' WHEN 1 THEN 'invited' WHEN 2 THEN 'exported'
       WHEN 3 THEN 'queried' WHEN 4 THEN 'shared' ELSE 'viewed'
     END AS event_name,
     TIMESTAMP '2025-01-01 00:00:00'
       + INTERVAL 1 DAY * ((i * 3) % 730)
       + INTERVAL 1 MINUTE * ((i * 17) % 1440) AS occurred_at,
     1 + ((i * 29) % 400) AS customer_id
   FROM range(1, 60001) t(i)`,
];
