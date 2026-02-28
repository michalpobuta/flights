import type { NormalizedFlight, ExploreResult } from "../providers/provider.js";

export function formatFlightsTable(flights: NormalizedFlight[]): string {
  if (flights.length === 0) return "No flights found.";

  const lines: string[] = [];
  lines.push(`Found **${flights.length}** flights:\n`);
  lines.push(
    "| # | Price | Airline | Flight | Route | Departure | Arrival | Duration | Stops | Source | Baggage |"
  );
  lines.push(
    "|---|-------|---------|--------|-------|-----------|---------|----------|-------|--------|---------|"
  );

  for (let i = 0; i < flights.length; i++) {
    const f = flights[i];
    const dep = formatDateTime(f.departure_time);
    const arr = formatDateTime(f.arrival_time);
    const dur = formatDuration(f.duration_minutes);
    const price = `${f.price} ${f.currency}`;
    const baggage = f.baggage_included ? "Yes" : "No";
    const link = f.deep_link ? `[Book](${f.deep_link})` : f.source;

    lines.push(
      `| ${i + 1} | **${price}** | ${f.airline} | ${f.flight_number} | ${f.origin}→${f.destination} | ${dep} | ${arr} | ${dur} | ${f.stops} | ${link} | ${baggage} |`
    );
  }

  return lines.join("\n");
}

export function formatExploreTable(results: ExploreResult[]): string {
  if (results.length === 0) return "No destinations found.";

  const lines: string[] = [];
  lines.push(`Found **${results.length}** cheap destinations:\n`);
  lines.push("| # | Destination | Price | Dates | Source |");
  lines.push("|---|-------------|-------|-------|--------|");

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const price = `${r.price} ${r.currency}`;
    const dates = `${r.departure_date} → ${r.return_date}`;
    const dest = r.destination_name
      ? `${r.destination_name} (${r.destination})`
      : r.destination;
    const link = r.deep_link ? `[Book](${r.deep_link})` : r.source;

    lines.push(`| ${i + 1} | **${dest}** | **${price}** | ${dates} | ${link} |`);
  }

  return lines.join("\n");
}

export function formatCompareTable(
  flights: NormalizedFlight[],
  origin: string,
  destination: string,
  date: string
): string {
  if (flights.length === 0) return "No prices found from any source.";

  const bySource = new Map<string, NormalizedFlight[]>();
  for (const f of flights) {
    const list = bySource.get(f.source) ?? [];
    list.push(f);
    bySource.set(f.source, list);
  }

  const lines: string[] = [];
  lines.push(`## Price Comparison: ${origin} → ${destination} on ${date}\n`);
  lines.push("| Source | Cheapest | Airline | Flight | Stops | Duration | Baggage |");
  lines.push("|--------|----------|---------|--------|-------|----------|---------|");

  const sources = ["kiwi", "amadeus", "serpapi", "ryanair", "skyscanner", "flightapi"] as const;
  for (const src of sources) {
    const srcFlights = bySource.get(src);
    if (!srcFlights || srcFlights.length === 0) {
      lines.push(`| ${src} | N/A | - | - | - | - | - |`);
      continue;
    }
    const cheapest = srcFlights[0]; // already sorted by price
    lines.push(
      `| ${src} | **${cheapest.price} ${cheapest.currency}** | ${cheapest.airline} | ${cheapest.flight_number} | ${cheapest.stops} | ${formatDuration(cheapest.duration_minutes)} | ${cheapest.baggage_included ? "Yes" : "No"} |`
    );
  }

  return lines.join("\n");
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().replace("T", " ").slice(0, 16);
  } catch {
    return iso;
  }
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
