import fs from 'node:fs';
import path from 'node:path';
import type { AppliedRow, ContactRow, JobRow, JobsFileInfo, Outputs } from '@jobhunt/shared';
import { OUTPUT_DIR } from '../config.ts';
import { parseCsv } from './csv.ts';

const DAILY_JOBS = /^daily_jobs_.*\.csv$/;

/**
 * Everything the tables show, read fresh from output/ on each call (the files are small).
 * `requested` picks an older daily_jobs CSV; anything not in the list falls back to the newest.
 */
export function readOutputs(requested?: string): Outputs {
  const applied = readApplied();
  const contacted = readContacted();
  const appliedLinks = new Set(applied.map((row) => row.link));
  const contactedCompanies = new Set(contacted.map((row) => normalize(row.company)));
  const mark = (job: Omit<JobRow, 'applied' | 'contacted'>): JobRow => ({
    ...job,
    applied: appliedLinks.has(job.link),
    contacted: contactedCompanies.has(normalize(job.company)),
  });

  const names = dailyJobsFiles();
  const jobsByFile = new Map(names.map((name) => [name, readJobs(path.join(OUTPUT_DIR, name))]));
  const jobsFiles: JobsFileInfo[] = names.map((name) => ({
    name,
    count: jobsByFile.get(name)?.length ?? 0,
  }));

  // Only names from the listing are ever read, so the query cannot reach other files.
  const latest = names[0] ?? null;
  const jobsFile = requested && jobsByFile.has(requested) ? requested : latest;
  const jobs = (jobsFile ? (jobsByFile.get(jobsFile) ?? []) : []).map(mark);
  const newInLatest = (latest ? (jobsByFile.get(latest) ?? []) : [])
    .map(mark)
    .filter((job) => !job.applied).length;

  return { jobsFile, jobsFiles, jobs, newInLatest, applied, contacted };
}

/** daily_jobs CSVs, newest first. Names end in _YYYY-MM-DD_HHMMSS, so they sort by time. */
function dailyJobsFiles(): string[] {
  return safeList(OUTPUT_DIR)
    .filter((name) => DAILY_JOBS.test(name))
    .sort()
    .reverse();
}

function readJobs(file: string): Omit<JobRow, 'applied' | 'contacted'>[] {
  const [header, ...rows] = readCsv(file);
  if (!header) return [];
  const col = columnLookup(header);
  return rows.map((row) => ({
    title: col(row, 'job title'),
    company: col(row, 'company'),
    location: col(row, 'location'),
    datePosted: col(row, 'date posted'),
    matchScore: toNumber(col(row, 'match score')),
    ranking: toNumber(col(row, 'ranking')),
    source: col(row, 'source'),
    link: col(row, 'job link'),
  }));
}

/**
 * applied_jobs.csv has no fixed header: older rows are `link,timestamp`, newer ones
 * `company,title,link,timestamp`. Find the link and timestamp by their shape instead.
 */
function readApplied(): AppliedRow[] {
  const rows = readCsv(path.join(OUTPUT_DIR, 'applied_jobs.csv'));
  const out: AppliedRow[] = [];
  for (const row of rows) {
    const link = row.find((cell) => /^https?:\/\//.test(cell.trim()))?.trim();
    if (!link) continue; // header or broken row
    const appliedAt = row.find((cell) => /^\d{4}-\d{2}-\d{2}T/.test(cell.trim()))?.trim() ?? '';
    const rest = row.map((c) => c.trim()).filter((c) => c && c !== link && c !== appliedAt);
    out.push({ link, appliedAt, company: rest[0] ?? '', title: rest[1] ?? '' });
  }
  return out;
}

function readContacted(): ContactRow[] {
  const [header, ...rows] = readCsv(path.join(OUTPUT_DIR, 'contacted_people.csv'));
  if (!header) return [];
  const col = columnLookup(header);
  return rows.map((row) => ({
    email: col(row, 'email'),
    company: col(row, 'company'),
    contactedAt: col(row, 'timestamp'),
  }));
}

function columnLookup(header: string[]): (row: string[], name: string) => string {
  const index = new Map(header.map((h, i) => [normalize(h), i]));
  return (row, name) => row[index.get(name) ?? -1]?.trim() ?? '';
}

function readCsv(file: string): string[][] {
  try {
    return parseCsv(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function safeList(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function toNumber(value: string): number | null {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Calls `onChange` (debounced) whenever a file in output/ is written. */
export function watchOutputs(onChange: () => void): void {
  let timer: NodeJS.Timeout | undefined;
  try {
    fs.watch(OUTPUT_DIR, () => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 500);
    });
  } catch (err) {
    console.warn(`Not watching ${OUTPUT_DIR}: ${String(err)}`);
  }
}
