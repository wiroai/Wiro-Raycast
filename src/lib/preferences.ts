import { Clipboard, getPreferenceValues, showInFinder, showToast, Toast } from "@raycast/api";
import { access, mkdir, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { extname, join } from "node:path";
import { USER_AGENT, type Credentials } from "./wiro";

export function credentials(): Credentials {
  const { apiKey, apiSecret } = getPreferenceValues<Preferences>();
  return { apiKey, apiSecret: apiSecret?.trim() ? apiSecret : undefined };
}

function saveFolder(): string {
  const { downloadDirectory } = getPreferenceValues<Preferences>();
  return downloadDirectory?.trim() || join(homedir(), "Downloads");
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

/** A file name for an output, such as `gpt-image-2-123456.png`. */
export function outputName(baseName: string, url: string, index: number, count: number): string {
  let extension = ".bin";
  try {
    extension = extname(new URL(url).pathname) || extension;
  } catch {
    // Keep the fallback extension.
  }
  const suffix = count > 1 ? `-${index + 1}` : "";
  return `${baseName.replace(/[^a-zA-Z0-9._-]+/g, "-")}${suffix}${extension.toLowerCase()}`;
}

async function download(url: string, path: string): Promise<void> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`The download failed (HTTP ${response.status}).`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}

export interface OutputFile {
  url: string;
  name: string;
}

/** Downloads outputs into the save folder and offers to show them in Finder. */
export async function saveOutputs(files: OutputFile[], noun: string): Promise<void> {
  const toast = await showToast({ style: Toast.Style.Animated, title: `Saving ${noun}` });
  const folder = saveFolder();
  await mkdir(folder, { recursive: true });
  const paths: string[] = [];
  for (const file of files) {
    const path = await freePath(folder, file.name);
    await download(file.url, path);
    paths.push(path);
  }
  toast.style = Toast.Style.Success;
  toast.title = paths.length > 1 ? `Saved ${paths.length} files` : `Saved ${noun}`;
  toast.message = folder;
  toast.primaryAction = {
    title: "Show in Finder",
    onAction: () => showInFinder(paths[paths.length - 1]),
  };
}

/** Downloads one output to a temporary file and puts the file on the clipboard. */
export async function copyOutput(file: OutputFile, noun: string): Promise<void> {
  const toast = await showToast({ style: Toast.Style.Animated, title: `Copying ${noun}` });
  const folder = join(tmpdir(), "wiro-raycast");
  await mkdir(folder, { recursive: true });
  const path = join(folder, file.name);
  await download(file.url, path);
  await Clipboard.copy({ file: path });
  toast.style = Toast.Style.Success;
  toast.title = `Copied ${noun}`;
}
