import {
  Action,
  ActionPanel,
  Clipboard,
  Icon,
  Keyboard,
  List,
  open,
  showInFinder,
  showToast,
  Toast,
} from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { formatBytes, type ResultItem } from "../lib/outputs";
import { cachedCopy, saveTitle, saveToFolder } from "../lib/preferences";
import { USER_AGENT } from "../lib/wiro";

const ICONS: Record<ResultItem["kind"], Icon> = {
  image: Icon.Image,
  video: Icon.Video,
  audio: Icon.Music,
  text: Icon.Text,
  file: Icon.Document,
};

// The preview shows the start of a long text; Copy, Paste and Save use all of it.
const PREVIEW_CHARS = 20_000;

/** Downloads the item into the cache folder once, so Quick Look, Copy and Open can use a local file. */
function useLocalCopy(item: ResultItem, group: string): string | undefined {
  const [path, setPath] = useState<string>();
  useEffect(() => {
    if (!item.url || item.kind === "text") return;
    let cancelled = false;
    cachedCopy(item.url, item.name, group)
      .then((local) => !cancelled && setPath(local))
      .catch(() => undefined); // Best effort: the actions download again on demand.
    return () => {
      cancelled = true;
    };
  }, [item.url, item.name, group]);
  return path;
}

/** The content of a text file output, such as a transcript, read once. */
function useRemoteText(item: ResultItem): string | undefined {
  const [text, setText] = useState<string | undefined>(item.text);
  useEffect(() => {
    if (item.text !== undefined || item.kind !== "text" || !item.url) return;
    let cancelled = false;
    fetch(item.url, { headers: { "User-Agent": USER_AGENT } })
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.text();
        if (!cancelled) setText(body);
      })
      .catch(() => undefined); // The item still offers Open in Browser.
    return () => {
      cancelled = true;
    };
  }, [item.url, item.text, item.kind]);
  return text;
}

function previewMarkdown(item: ResultItem, text: string | undefined): string {
  switch (item.kind) {
    case "image":
      return `![${item.name}](${item.url})`;
    case "text":
      if (text === undefined) return "_Loading the text…_";
      return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text;
    case "video":
      return `## ${item.name}\n\nVideo. Open it, or preview it with Quick Look.`;
    case "audio":
      return `## ${item.name}\n\nAudio. Open it, or play it with Quick Look.`;
    default:
      return `## ${item.name}\n\n[Open in browser](${item.url})`;
  }
}

interface OutputListItemProps {
  item: ResultItem;
  /** Groups cached files, such as the task id. */
  group: string;
  /** Metadata rows for the detail panel. */
  metadata?: ReactNode;
  /** Actions added after the item's own, such as Open Model Page. */
  extraActions?: ReactNode;
}

export function OutputListItem({ item, group, metadata, extraActions }: OutputListItemProps) {
  const localPath = useLocalCopy(item, group);
  const text = useRemoteText(item);
  const savedPath = useRef<string | undefined>(undefined);
  const noun = item.kind === "text" ? "text" : item.kind === "file" ? "file" : item.kind;

  async function local(): Promise<string> {
    if (localPath) return localPath;
    if (!item.url) throw new Error("This output has no file.");
    return cachedCopy(item.url, item.name, group);
  }

  async function run(title: string, action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      await showFailureToast(error, { title });
    }
  }

  async function save(): Promise<string> {
    const toast = await showToast({ style: Toast.Style.Animated, title: `Saving ${noun}` });
    const path = await saveToFolder(
      { url: item.url, localPath, text },
      item.kind === "text" && !/\.(txt|srt|vtt|md|csv|json)$/i.test(item.name) ? `${item.name}.txt` : item.name,
    );
    savedPath.current = path;
    toast.style = Toast.Style.Success;
    toast.title = `Saved ${noun}`;
    toast.message = path;
    toast.primaryAction = { title: "Show in Finder", onAction: () => showInFinder(path) };
    return path;
  }

  const saveAction = (
    <Action
      title={saveTitle()}
      icon={Icon.Download}
      shortcut={Keyboard.Shortcut.Common.Save}
      onAction={() => run(`Could not save the ${noun}`, async () => void (await save()))}
    />
  );
  const finderAction = (
    <Action
      title="Show in Finder"
      icon={Icon.Finder}
      shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
      onAction={() => run("Could not show the file", async () => showInFinder(savedPath.current ?? (await save())))}
    />
  );
  const copyFileAction = (title: string, primary: boolean) => (
    <Action
      title={title}
      icon={Icon.CopyClipboard}
      shortcut={primary ? undefined : { modifiers: ["cmd", "shift"], key: "v" }}
      onAction={() =>
        run(`Could not copy the ${noun}`, async () => {
          await Clipboard.copy({ file: await local() });
          await showToast({ style: Toast.Style.Success, title: `Copied ${noun}` });
        })
      }
    />
  );
  const openAction = (
    <Action
      title="Open"
      icon={Icon.AppWindow}
      shortcut={Keyboard.Shortcut.Common.Open}
      onAction={() => run(`Could not open the ${noun}`, async () => open(await local()))}
    />
  );
  const quickLook = localPath ? <Action.ToggleQuickLook shortcut={Keyboard.Shortcut.Common.ToggleQuickLook} /> : null;
  const urlActions = item.url ? (
    <>
      <Action.OpenInBrowser url={item.url} />
      <Action.CopyToClipboard title="Copy URL" content={item.url} shortcut={Keyboard.Shortcut.Common.Copy} />
    </>
  ) : null;

  let actions: ReactNode;
  if (item.kind === "image") {
    actions = (
      <>
        {copyFileAction("Copy Image", true)}
        {saveAction}
        {finderAction}
        {quickLook}
        {openAction}
        {urlActions}
      </>
    );
  } else if (item.kind === "video" || item.kind === "audio") {
    actions = (
      <>
        {openAction}
        {quickLook}
        {saveAction}
        {finderAction}
        {copyFileAction(item.kind === "video" ? "Copy Video" : "Copy Audio", false)}
        {urlActions}
      </>
    );
  } else if (item.kind === "text") {
    actions = (
      <>
        {text !== undefined && <Action.CopyToClipboard title="Copy Text" content={text} />}
        {text !== undefined && (
          <Action.Paste title="Paste Text" content={text} shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }} />
        )}
        {saveAction}
        {finderAction}
        {urlActions}
      </>
    );
  } else {
    actions = (
      <>
        {item.url && <Action.OpenInBrowser url={item.url} />}
        {saveAction}
        {finderAction}
        {quickLook}
        {item.url && (
          <Action.CopyToClipboard title="Copy URL" content={item.url} shortcut={Keyboard.Shortcut.Common.Copy} />
        )}
      </>
    );
  }

  return (
    <List.Item
      id={item.id}
      icon={ICONS[item.kind]}
      title={item.kind === "text" ? (text ?? item.name).replace(/\s+/g, " ").slice(0, 80) || item.name : item.name}
      accessories={formatBytes(item.sizeBytes) ? [{ text: formatBytes(item.sizeBytes) }] : undefined}
      quickLook={localPath ? { path: localPath, name: item.name } : undefined}
      detail={<List.Item.Detail markdown={previewMarkdown(item, text)} metadata={metadata} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section>{actions}</ActionPanel.Section>
          {extraActions && <ActionPanel.Section>{extraActions}</ActionPanel.Section>}
        </ActionPanel>
      }
    />
  );
}
