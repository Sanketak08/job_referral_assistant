import fs from 'node:fs';
import path from 'node:path';
import type { ProfileFile } from '@jobhunt/shared';
import { PROFILE_PATH } from '../config.ts';

/** First name from `candidate.name` in profile.yaml, or null if the file or field is missing. */
export function readFirstName(): string | null {
  let text: string;
  try {
    text = fs.readFileSync(PROFILE_PATH, 'utf8');
  } catch {
    return null;
  }
  // The first indented `name:` under `candidate:`; avoids a YAML dependency for one field.
  const match = /^candidate:\s*\n(?:[ \t]+.*\n)*?[ \t]+name:\s*["']?([^"'\n]+)/m.exec(text);
  return match?.[1]?.trim().split(/\s+/)[0] ?? null;
}

export function readProfile(): ProfileFile {
  return {
    text: fs.readFileSync(PROFILE_PATH, 'utf8'),
    modifiedAt: fs.statSync(PROFILE_PATH).mtimeMs,
  };
}

export class ProfileConflictError extends Error {}

/**
 * Saves profile.yaml, keeping the previous version as profile.yaml.bak. Refuses when the file
 * changed after the editor loaded it (Claude may have added an answer during a run).
 */
export function writeProfile(text: string, baseModifiedAt: number): ProfileFile {
  const current = fs.statSync(PROFILE_PATH).mtimeMs;
  if (Math.abs(current - baseModifiedAt) > 1) {
    throw new ProfileConflictError(
      'profile.yaml changed since you opened it. Reload to see the new version, then edit again.',
    );
  }
  fs.copyFileSync(PROFILE_PATH, `${PROFILE_PATH}.bak`);
  fs.writeFileSync(PROFILE_PATH, text);
  return readProfile();
}

/** Copies profile.yaml to profile.yaml.bak (before Claude edits it). */
export function backupProfile(): void {
  if (fs.existsSync(PROFILE_PATH)) fs.copyFileSync(PROFILE_PATH, `${PROFILE_PATH}.bak`);
}

/**
 * Calls `onChange` (debounced) when profile.yaml is written, whoever writes it. Watches the folder
 * because editors and Claude often replace the file, which ends a watch on the file itself.
 */
export function watchProfile(onChange: () => void): void {
  const name = path.basename(PROFILE_PATH);
  let timer: NodeJS.Timeout | undefined;
  try {
    fs.watch(path.dirname(PROFILE_PATH), (_event, changed) => {
      if (changed !== name) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, 300);
    });
  } catch (err) {
    console.warn(`Not watching ${PROFILE_PATH}: ${String(err)}`);
  }
}
