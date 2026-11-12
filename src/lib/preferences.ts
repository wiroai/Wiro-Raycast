import { getPreferenceValues } from "@raycast/api";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { USER_AGENT, type Credentials } from "./wiro";

export function credentials(): Credentials {
  const { apiKey, apiSecret } = getPreferenceValues<Preferences>();
  return { apiKey, apiSecret: apiSecret?.trim() ? apiSecret : undefined };
}

/** Where Save puts files: the Save Folder preference, or Downloads. */
export function saveFolder(): string {
  const { downloadDirectory } = getPreferenceValues<Preferences>();
  return downloadDirectory?.trim() || join(homedir(), "Downloads");
}

/** "Save to Downloads", or the name of the folder the user picked. */
export function saveTitle(): string {
  const { downloadDirectory } = getPreferenceValues<Preferences>();
  return downloadDirectory?.trim() ? `Save to ${basename(downloadDirectory.trim())}` : "Save to Downloads";
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function freePath(folder: string, name: string): Promise<string> {
  const extension = extname(name);
  const stem = name.slice(0, name.length - extension.length);
  let candidate = join(folder, name);
  for (let index = 2; await exists(candidate); index += 1) {
    candidate = join(folder, `${stem}-${index}${extension}`);
  }
  return candidate;
}

/** A file name that is safe on disk, such as `gpt-image-2-123456.png`. */
export function safeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "wiro-output";
}

/** Downloads to a temporary name first, so a half-written file never looks finished. */
async function download(url: string, path: string): Promise<void> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`The download failed (HTTP ${response.status}).`);
  const partial = `${path}.part`;
  await writeFile(partial, Buffer.from(await response.arrayBuffer()));
  await rename(partial, path);
}

const pendingCopies = new Map<string, Promise<string>>();

/**
 * Downloads an output once into a temporary folder, for Quick Look and the clipboard. Outputs
 * often share a name such as 0.png, so the file name starts with a hash of its address.
 */
export function cachedCopy(url: string, name: string, group: string): Promise<string> {
  const folder = join(tmpdir(), "wiro-raycast", safeName(group));
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 10);
  const path = join(folder, `${hash}-${safeName(name)}`);
  let pending = pendingCopies.get(path);
  if (!pending) {
    pending = (async () => {
      await mkdir(folder, { recursive: true });
      if (!(await exists(path))) await download(url, path);
      return path;
    })();
    pending.catch(() => pendingCopies.delete(path));
    pendingCopies.set(path, pending);
  }
  return pending;
}

/**
 * Saves an output into the save folder and returns the saved file's path. A downloaded copy
 * or the original file wins over text, so a text file is saved byte for byte.
 */
export async function saveToFolder(source: { url?: string; localPath?: string; text?: string }, name: string) {
  const folder = saveFolder();
  await mkdir(folder, { recursive: true });
  const path = await freePath(folder, safeName(name));
  if (source.localPath && (await exists(source.localPath))) await copyFile(source.localPath, path);
  else if (source.url) await download(source.url, path);
  else if (source.text !== undefined) await writeFile(path, source.text, "utf8");
  else throw new Error("There is nothing to save.");
  return path;
}
