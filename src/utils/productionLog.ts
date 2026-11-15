import fs from "node:fs";
import path from "node:path";

export type LogSource = "manual" | "batch" | "api" | "rerender";

export interface ProductionLogEntry {
  id: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  source: LogSource;
  topic: string;
  series?: string;
  preset: string;
  aspectRatio: string;
  outputs: string[];
  status: "success" | "error";
  folderName?: string;
  error?: string;
}

const MAX_LOG_ENTRIES = 200;

function getLogFilePath(): string {
  return path.resolve(process.cwd(), "outputs", "production_log.json");
}

export function readProductionLogs(limit = 100): ProductionLogEntry[] {
  const filePath = getLogFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, limit);
  } catch {
    return [];
  }
}

export function appendProductionLog(entry: ProductionLogEntry): void {
  const filePath = getLogFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const existing = readProductionLogs(MAX_LOG_ENTRIES);
  const next = [entry, ...existing].slice(0, MAX_LOG_ENTRIES);
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf-8");
}

export function clearProductionLogs(): void {
  const filePath = getLogFilePath();
  if (fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]", "utf-8");
  }
}
