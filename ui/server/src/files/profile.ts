import fs from 'node:fs';
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
