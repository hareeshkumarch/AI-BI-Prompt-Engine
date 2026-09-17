import type { SchemaContext, SqlDialect } from "./types";
import { schemaPrompt } from "./schema-contextualizer";
import { MAX_ROW_LIMIT } from "./sql-guardrails";
import { logger } from "../../lib/logger";

const OPENAI_MODEL = process.env["OPENAI_MODEL"] ?? "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = Number(process.env["OPENAI_TIMEOUT_MS"] ?? 20_000);

function monthExpression(dialect: SqlDialect) {
  if (dialect === "mysql") return "DATE_FORMAT(ordered_at, '%Y-%m-01')";
  if (dialect === "sqlite") return "strftime('%Y-%m-01', ordered_at)";
  return "DATE_TRUNC('month', ordered_at)";
}

type GeneratedSql = {
  sql: string;
  explanation: string;
  targetedTables: string[];
  clarification: string | null;
};

type GeneratedInsight = {
  insights: string[];
  chartType: "line" | "bar" | "area" | "scatter" | "pie" | "kpi_card" | "table";
  echartsSpec: Record<string, unknown>;
  confidence: number;
};

function deterministicSql(question: string, dialect: SqlDialect): GeneratedSql {
  const normalized = question.toLowerCase();
  if (normalized.includes("customer") && normalized.includes("spend")) {
    return {
      sql: `SELECT c.company_name, SUM(o.net_revenue) AS total_spend
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
WHERE o.status <> 'refunded'
GROUP BY c.company_name
ORDER BY total_spend DESC
LIMIT 5`,
      explanation: "Joins orders to customers, excludes refunded revenue, then ranks customers by net spend.",
      targetedTables: ["orders", "customers"],
      clarification: null,
    };
  }
  if (normalized.includes("month") || normalized.includes("trend") || normalized.includes("growth")) {
    return {
      sql: `SELECT ${monthExpression(dialect)} AS month, SUM(net_revenue) AS revenue
FROM orders
WHERE status <> 'refunded'
GROUP BY month
ORDER BY month
LIMIT 120`,
      explanation: "Buckets non-refunded orders by calendar month and returns a bounded time series.",
      targetedTables: ["orders"],
      clarification: null,
    };
  }
  if (normalized.includes("revenue") || normalized.includes("sales")) {
    return {
      sql: `SELECT SUM(net_revenue) AS revenue, COUNT(*) AS order_count
FROM orders
WHERE status <> 'refunded'
LIMIT 1`,
      explanation: "Returns the core revenue KPI and supporting order count from the orders fact table.",
      targetedTables: ["orders"],
      clarification: null,
    };
  }
  return {
    sql: "",
    explanation: "The request needs a metric and grouping that are not unambiguous from the available semantic catalog.",
    targetedTables: [],
    clarification: "Which metric should I analyze, and should the result be grouped by time, customer, product, or another dimension?",
  };
}

export async function generateSql(
  question: string,
  context: SchemaContext,
): Promise<GeneratedSql> {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) return deterministicSql(question, context.dialect);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are a read-only text-to-SQL engine. Return JSON with sql, explanation, targetedTables, clarification. Never emit DDL/DML, never use SELECT *, always include an outermost LIMIT <= ${MAX_ROW_LIMIT}, obey ${context.dialect}. If the metric or grain is ambiguous, return an empty sql and a concise clarification. Schema:\n${schemaPrompt(context)}`,
          },
          { role: "user", content: question },
        ],
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, "SQL generation provider rejected the request; using the deterministic fallback");
      return deterministicSql(question, context.dialect);
    }

    const payload = (await response.json()) as { choices?: [{ message?: { content?: string } }] };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as Partial<GeneratedSql>;
    return {
      sql: typeof parsed.sql === "string" ? parsed.sql : "",
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
      targetedTables: Array.isArray(parsed.targetedTables) ? parsed.targetedTables.map(String) : [],
      clarification: typeof parsed.clarification === "string" && parsed.clarification ? parsed.clarification : null,
    };
  } catch (error) {
    logger.warn({ err: error }, "SQL generation provider failed; using the deterministic fallback");
    return deterministicSql(question, context.dialect);
  }
}

export function synthesizeInsight(question: string, result: { columns: string[]; rows: Record<string, unknown>[] }): GeneratedInsight {
  const isTimeSeries = result.columns.some((column) => /month|date|time|week/i.test(column));
  const dimension = result.columns.find((column) => !/revenue|count|amount|total|mrr|value/i.test(column));
  const measure = result.columns.find((column) => /revenue|count|amount|total|mrr|value/i.test(column));
  const values = result.rows.map((row) => {
    const value = Number(row[measure ?? ""]);
    return Number.isFinite(value) ? value : 0;
  });
  const total = values.reduce((sum, value) => sum + value, 0);
  const peak = values.length > 0 ? Math.max(...values) : 0;
  const peakIndex = values.indexOf(peak);
  const labels = result.rows.map((row) => String(row[dimension ?? result.columns[0]] ?? ""));

  if (result.rows.length === 1 && measure) {
    const headline = Number(result.rows[0]?.[measure]);
    return {
      insights: [`${measure.replaceAll("_", " ")} is ${Number.isFinite(headline) ? headline.toLocaleString() : "not available"} for this query.`],
      chartType: "kpi_card",
      echartsSpec: { title: { text: question }, series: [{ type: "gauge", data: [{ value: values[0] ?? 0 }] }] },
      confidence: 0.86,
    };
  }

  return {
    insights: [
      `${result.rows.length} groups returned, covering ${measure ? total.toLocaleString() : "the selected breakdown"}.`,
      peakIndex >= 0 && labels[peakIndex] ? `${labels[peakIndex]} is the leading group at ${peak.toLocaleString()}.` : "The result is ready for comparison.",
      isTimeSeries ? "The result is ordered for trend analysis across the selected time grain." : "The result is ranked for contribution analysis.",
    ],
    chartType: isTimeSeries ? "line" : "bar",
    echartsSpec: {
      animationDuration: 500,
      tooltip: { trigger: "axis" },
      grid: { left: 48, right: 24, top: 28, bottom: 48 },
      xAxis: { type: "category", data: labels },
      yAxis: { type: "value" },
      series: [{ type: isTimeSeries ? "line" : "bar", smooth: true, data: values }],
    },
    confidence: result.rows.length > 1 ? 0.82 : 0.65,
  };
}