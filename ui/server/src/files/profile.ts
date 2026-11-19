import fs from 'node:fs';
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
