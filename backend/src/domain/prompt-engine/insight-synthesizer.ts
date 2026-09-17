import { profileResult, type DataProfile, type FieldProfile } from "./data-profile";
import { recommendCharts } from "./chart-mapper";
import type { InsightOutput, QueryResult } from "./types";

const formatNumber = (value: number) =>
  Math.abs(value) >= 10000 ? Math.round(value).toLocaleString() : Number(value.toFixed(2)).toLocaleString();

const humanize = (name: string) => name.replaceAll("_", " ");

function leadingRow(rows: Record<string, unknown>[], measure: string, label: string | null) {
  let best: { label: string; value: number } | null = null;
  for (const row of rows) {
    const value = Number(row[measure]);
    if (!Number.isFinite(value)) continue;
    if (!best || value > best.value) {
      best = { label: label ? String(row[label] ?? "") : "", value };
    }
  }
  return best;
}

function trendSentence(profile: DataProfile, measure: FieldProfile) {
  const temporal = profile.fields.find((field) => field.type === "temporal");
  if (!temporal) return null;
  const grain = temporal.temporalGrain ?? "period";
  if (measure.monotonic === "increasing") return `${humanize(measure.name)} rises in every ${grain} in range.`;
  if (measure.monotonic === "decreasing") return `${humanize(measure.name)} falls in every ${grain} in range.`;
  return `The series is ordered for ${grain}-over-${grain} comparison.`;
}

function qualitySentence(profile: DataProfile) {
  const incomplete = profile.fields.filter((field) => field.nullRate > 0).sort((a, b) => b.nullRate - a.nullRate);
  const worst = incomplete[0];
  if (!worst) return null;
  return `${humanize(worst.name)} is missing in ${Math.round(worst.nullRate * 100)}% of rows — totals exclude those.`;
}

export function synthesizeInsight(result: QueryResult): InsightOutput {
  const profile = profileResult(result.columns, result.rows);
  const { primary, alternatives } = recommendCharts(profile);

  const measure = profile.fields.find((field) => field.name === profile.measures[0]) ?? null;
  const category = profile.fields.find((field) => field.name === (primary.x?.field ?? "")) ?? null;
  const categoryLabel = category && category.role === "dimension" ? category.name : null;

  const insights: string[] = [];

  if (primary.chartType === "kpi") {
    for (const ref of primary.y) {
      const value = Number(result.rows[0]?.[ref.field]);
      insights.push(`${humanize(ref.field)} is ${Number.isFinite(value) ? formatNumber(value) : "not available"} for this query.`);
    }
  } else if (measure) {
    const unit = categoryLabel ? humanize(categoryLabel) : "row";
    insights.push(
      `${profile.rowCount} ${unit}${profile.rowCount === 1 ? "" : "s"} returned, totalling ${formatNumber(measure.sum ?? 0)} ${humanize(measure.name)}.`,
    );
    const leader = leadingRow(result.rows, measure.name, categoryLabel);
    if (leader && leader.label) insights.push(`${leader.label} leads at ${formatNumber(leader.value)}.`);
    const trend = trendSentence(profile, measure);
    if (trend) insights.push(trend);
  } else {
    insights.push(`${profile.rowCount} rows returned with no numeric measure to summarize.`);
  }

  const quality = qualitySentence(profile);
  if (quality) insights.push(quality);

  return {
    insights,
    chartType: primary.chartType,
    encoding: primary,
    alternatives,
    dataProfile: profile,
    confidence: Math.min(0.97, Math.max(0.3, primary.score / 100)),
  };
}
