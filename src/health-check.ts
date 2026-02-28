import { config } from "dotenv";
import type { IFlightProvider } from "./providers/provider.js";
import { KiwiProvider } from "./providers/kiwi.js";
import { AmadeusProvider } from "./providers/amadeus.js";
import { SerpAPIProvider } from "./providers/serpapi.js";
import { RyanairProvider } from "./providers/ryanair.js";
import { SkyscannerProvider } from "./providers/skyscanner.js";
import { FlightAPIProvider } from "./providers/flightapi.js";

config();

interface HealthResult {
  provider: string;
  credentials: boolean;
  reachable: boolean | null;
  responseMs: number | null;
  error: string | null;
}

async function checkProvider(provider: IFlightProvider): Promise<HealthResult> {
  const result: HealthResult = {
    provider: provider.name,
    credentials: provider.isAvailable(),
    reachable: null,
    responseMs: null,
    error: null,
  };

  if (!result.credentials) {
    return result;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);

  const start = performance.now();
  try {
    await Promise.race([
      provider.searchFlights({
        origin: "KRK",
        destination: "LHR",
        date_from: dateStr,
        passengers: 1,
        max_stops: 1,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout (10s)")), 10_000)
      ),
    ]);
    result.reachable = true;
    result.responseMs = Math.round(performance.now() - start);
  } catch (err) {
    result.reachable = false;
    result.responseMs = Math.round(performance.now() - start);
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

async function main() {
  const providers: IFlightProvider[] = [
    new KiwiProvider(process.env.KIWI_API_KEY ?? ""),
    new AmadeusProvider(
      process.env.AMADEUS_CLIENT_ID ?? "",
      process.env.AMADEUS_CLIENT_SECRET ?? ""
    ),
    new SerpAPIProvider(process.env.SERPAPI_KEY ?? ""),
    new RyanairProvider(),
    new SkyscannerProvider(process.env.RAPIDAPI_KEY ?? ""),
    new FlightAPIProvider(process.env.FLIGHTAPI_KEY ?? ""),
  ];

  console.log("Flight Provider Health Check\n");
  console.log("Checking %d providers...\n", providers.length);

  const results = await Promise.all(providers.map(checkProvider));

  // Print table
  const nameW = 12;
  const credW = 13;
  const statusW = 12;
  const timeW = 10;
  const errorW = 30;

  const header = [
    "Provider".padEnd(nameW),
    "Credentials".padEnd(credW),
    "Status".padEnd(statusW),
    "Time".padEnd(timeW),
    "Error".padEnd(errorW),
  ].join(" | ");

  const separator = [nameW, credW, statusW, timeW, errorW]
    .map((w) => "-".repeat(w))
    .join("-+-");

  console.log(header);
  console.log(separator);

  for (const r of results) {
    const credStr = r.credentials ? "OK" : "missing";
    let statusStr: string;
    if (r.reachable === null) statusStr = "skipped";
    else if (r.reachable) statusStr = "reachable";
    else statusStr = "FAILED";

    const timeStr = r.responseMs !== null ? `${r.responseMs}ms` : "-";
    const errorStr = r.error ? r.error.slice(0, errorW) : "-";

    console.log(
      [
        r.provider.padEnd(nameW),
        credStr.padEnd(credW),
        statusStr.padEnd(statusW),
        timeStr.padEnd(timeW),
        errorStr.padEnd(errorW),
      ].join(" | ")
    );
  }

  const working = results.filter((r) => r.reachable === true).length;
  const withCreds = results.filter((r) => r.credentials).length;

  console.log(
    "\nSummary: %d/%d providers have credentials, %d/%d reachable",
    withCreds,
    results.length,
    working,
    results.length
  );

  process.exit(working > 0 ? 0 : 1);
}

main();
