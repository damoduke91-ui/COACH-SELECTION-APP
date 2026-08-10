import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const ROOT = process.cwd();
const execFileAsync = promisify(execFile);
const INCLUDED_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".yml",
  ".yaml",
]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".vercel",
  "node_modules",
]);

const INVALID_PATTERNS = [
  { label: "Unicode replacement character", pattern: /\uFFFD/u },
  { label: "common UTF-8 mojibake", pattern: /(?:â€¢|â€”|â€“|â†|âœ|ï¿½)/u },
  { label: "corrupted on-field separator", pattern: /On-field:[^\r\n]* \? Emergencies:/u },
  { label: "corrupted fixture separator", pattern: /details\.join\(["'] \? ["']\)/u },
  { label: "corrupted schedule separator", pattern: /Schedule ON \?/u },
  { label: "corrupted countdown separator", pattern: /Countdown unavailable \?/u },
  { label: "corrupted back arrow", pattern: /\? Back to Dashboard/u },
  { label: "corrupted ordinal range", pattern: /\d+(?:st|nd|rd|th)\?\d+(?:st|nd|rd|th)/u },
  { label: "corrupted club separator", pattern: /`\? \$\{getPlayerClub/u },
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && INCLUDED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolutePath);
    }
  }

  return files;
}

const failures = [];

for (const absolutePath of await collectFiles(ROOT)) {
  const content = await readFile(absolutePath, "utf8");
  const relativePath = path.relative(ROOT, absolutePath);

  if (content.startsWith("\uFEFF")) {
    failures.push(`${relativePath}:1 - UTF-8 byte-order mark (BOM)`);
  }

  if (relativePath === path.join("scripts", "check-encoding.mjs")) {
    continue;
  }

  for (const { label, pattern } of INVALID_PATTERNS) {
    const match = pattern.exec(content);

    if (!match) {
      continue;
    }

    const line = content.slice(0, match.index).split(/\r?\n/u).length;
    failures.push(`${relativePath}:${line} - ${label}`);
  }
}

const { stdout: gitEolOutput } = await execFileAsync("git", ["ls-files", "--eol"], {
  cwd: ROOT,
});

for (const line of gitEolOutput.split(/\r?\n/u)) {
  const match = /^i\/(\S+)\s+[^\t]*\t(.+)$/u.exec(line);
  if (!match || match[1] !== "crlf") continue;

  const relativePath = match[2];
  if (INCLUDED_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
    failures.push(`${relativePath}:1 - committed CRLF line endings (LF required)`);
  }
}

if (failures.length > 0) {
  console.error("Encoding corruption detected:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("Encoding check passed.");
}
