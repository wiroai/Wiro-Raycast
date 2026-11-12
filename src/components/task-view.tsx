import { Action, ActionPanel, Alert, confirmAlert, Detail, Icon, Keyboard, showToast, Toast } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { useEffect, useRef, useState } from "react";
import { copyOutput, credentials, outputName, saveOutputs, type OutputFile } from "../lib/preferences";
import {
  failureReason,
  formatCost,
  formatSeconds,
  getTask,
  isFinished,
  isSuccessful,
  mediaOutputs,
  modelPageUrl,
  pollInterval,
  SITE_URL,
  statusLabel,
  stopTask,
  WiroError,
  type RunResult,
  type Task,
} from "../lib/wiro";

export type MediaKind = "image" | "video";

const TASK_HISTORY_URL = `${SITE_URL}/panel/task-history`;
const MAX_POLL_FAILURES = 5;

interface TaskViewProps {
  kind: MediaKind;
  slug: string;
  run: RunResult;
  prompt: string;
}

function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function isPermanent(error: unknown): boolean {
  return error instanceof WiroError && error.status !== undefined && error.status >= 400 && error.status < 500;
}

export function TaskView({ kind, slug, run, prompt }: TaskViewProps) {
  const [task, setTask] = useState<Task>();
  const [pollError, setPollError] = useState<Error>();
  const [elapsedMs, setElapsedMs] = useState(0);
  const toastRef = useRef<Toast | undefined>(undefined);
  const noun = kind === "image" ? "image" : "video";

  useEffect(() => {
    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const ticker = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);

    const finish = async (current: Task | undefined, error?: Error) => {
      clearInterval(ticker);
      const toast = toastRef.current;
      if (!toast) return;
      if (current && isSuccessful(current)) {
        toast.style = Toast.Style.Success;
        toast.title = kind === "image" ? "Image ready" : "Video ready";
        toast.message = formatCost(current.totalcost);
      } else {
        toast.style = Toast.Style.Failure;
        toast.title = current?.status === "task_cancel" ? "Task cancelled" : `Could not generate the ${noun}`;
        toast.message = error?.message ?? (current ? failureReason(current) : undefined);
      }
    };

    const poll = async () => {
      try {
        const current = await getTask(run.tasktoken, credentials(), controller.signal);
        if (controller.signal.aborted) return;
        failures = 0;
        setTask(current);
        if (isFinished(current)) {
          await finish(current);
          return;
        }
        if (toastRef.current) toastRef.current.message = statusLabel(current.status);
      } catch (error) {
        if (controller.signal.aborted) return;
        failures += 1;
        if (isPermanent(error) || failures >= MAX_POLL_FAILURES) {
          const reason = error instanceof Error ? error : new Error(String(error));
          setPollError(reason);
          await finish(undefined, reason);
          return;
        }
      }
      timer = setTimeout(poll, pollInterval(Date.now() - startedAt));
    };

    showToast({ style: Toast.Style.Animated, title: kind === "image" ? "Generating image" : "Generating video" }).then(
      (toast) => {
        if (controller.signal.aborted) {
          toast.hide();
          return;
        }
        toastRef.current = toast;
      },
    );
    poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
      clearInterval(ticker);
      if (toastRef.current?.style === Toast.Style.Animated) toastRef.current.hide();
    };
  }, [run.tasktoken]);

  const finished = task !== undefined && isFinished(task);
  const succeeded = task !== undefined && isSuccessful(task);
  const images = succeeded ? mediaOutputs(task, "image") : [];
  const videos = succeeded ? mediaOutputs(task, "video") : [];
  const results = kind === "image" ? images : videos;
  const baseName = `${slug.split("/").pop() ?? "wiro"}-${run.taskid || "result"}`;
  const files: OutputFile[] = results.map((output, index) => ({
    url: output.url ?? "",
    name: outputName(baseName, output.url ?? "", index, results.length),
  }));

  let markdown: string;
  if (pollError) {
    markdown = `## Could not follow the task\n\n${pollError.message}\n\nThe task may still finish. Its result shows up in your task history on wiro.ai.`;
  } else if (!finished) {
    const status = task ? statusLabel(task.status) : "Starting";
    const seconds = Math.floor(elapsedMs / 1000);
    markdown = [
      `## Generating ${kind === "image" ? "an image" : "a video"} with \`${slug}\``,
      `**${status}** · ${seconds} s`,
      prompt ? quote(prompt) : "",
      kind === "video"
        ? "Video models usually need one to a few minutes. Closing this view does not stop the task, and its result also shows up in your task history on wiro.ai."
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  } else if (!succeeded) {
    markdown = `## The ${noun} was not generated\n\n${failureReason(task)}\n\nTasks that do not finish are not charged.`;
  } else if (results.length === 0) {
    markdown = `## The task finished without ${kind === "image" ? "an image" : "a video"}\n\nOpen your task history on wiro.ai to see what the model returned.`;
  } else if (kind === "image") {
    markdown = [...images.map((output, index) => `![Image ${index + 1}](${output.url})`), prompt ? quote(prompt) : ""]
      .filter(Boolean)
      .join("\n\n");
  } else {
    const poster = images[0]?.url;
    markdown = [
      "## Your video is ready",
      poster ? `![Video preview](${poster})` : "",
      ...files.map((file) => `[${file.name}](${file.url})`),
      prompt ? quote(prompt) : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const cost = task ? formatCost(task.totalcost) : undefined;
  const duration = task ? formatSeconds(task.elapsedseconds) : undefined;
  const metadata = (
    <Detail.Metadata>
      <Detail.Metadata.Link title="Model" text={slug} target={modelPageUrl(slug)} />
      <Detail.Metadata.Label
        title="Status"
        text={pollError ? "Unknown" : task ? statusLabel(task.status) : "Starting"}
      />
      {duration && <Detail.Metadata.Label title="Run Time" text={duration} />}
      {cost && <Detail.Metadata.Label title="Cost" text={cost} />}
      {run.taskid && <Detail.Metadata.Label title="Task ID" text={run.taskid} />}
    </Detail.Metadata>
  );

  async function cancel() {
    if (!task) return;
    const confirmed = await confirmAlert({
      title: "Cancel this task?",
      message: "The model stops working on it. Cancelled tasks are not charged.",
      primaryAction: { title: "Cancel Task", style: Alert.ActionStyle.Destructive },
      dismissAction: { title: "Keep Running" },
    });
    if (!confirmed) return;
    try {
      await stopTask(task, credentials());
      await showToast({ style: Toast.Style.Success, title: "Cancelling task" });
    } catch (error) {
      await showFailureToast(error, { title: "Could not cancel the task" });
    }
  }

  async function attempt(action: () => Promise<void>, failureTitle: string) {
    try {
      await action();
    } catch (error) {
      await showFailureToast(error, { title: failureTitle });
    }
  }

  const first = files[0];
  const title = kind === "image" ? "Image" : "Video";

  return (
    <Detail
      isLoading={!finished && !pollError}
      markdown={markdown}
      metadata={metadata}
      actions={
        <ActionPanel>
          {first && kind === "image" && (
            <Action
              title="Copy Image"
              icon={Icon.CopyClipboard}
              onAction={() => attempt(() => copyOutput(first, "image"), "Could not copy the image")}
            />
          )}
          {first && kind === "video" && <Action.OpenInBrowser title="Open Video" url={first.url} />}
          {first && (
            <Action
              title={files.length > 1 ? `Save ${files.length} ${title}s` : `Save ${title}`}
              icon={Icon.Download}
              shortcut={Keyboard.Shortcut.Common.Save}
              onAction={() => attempt(() => saveOutputs(files, noun), `Could not save the ${noun}`)}
            />
          )}
          {first && kind === "video" && (
            <Action
              title="Copy Video"
              icon={Icon.CopyClipboard}
              shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
              onAction={() => attempt(() => copyOutput(first, "video"), "Could not copy the video")}
            />
          )}
          {first && kind === "image" && (
            <Action.OpenInBrowser
              title="Open Image in Browser"
              url={first.url}
              shortcut={Keyboard.Shortcut.Common.Open}
            />
          )}
          {first && (
            <Action.CopyToClipboard
              title={`Copy ${title} URL`}
              content={files.map((file) => file.url).join("\n")}
              shortcut={Keyboard.Shortcut.Common.Copy}
            />
          )}
          {task && !finished && !pollError && (
            <Action
              title="Cancel Task"
              icon={Icon.XMarkCircle}
              style={Action.Style.Destructive}
              shortcut={Keyboard.Shortcut.Common.Remove}
              onAction={cancel}
            />
          )}
          <Action.OpenInBrowser title="Open Model Page" icon={Icon.Globe} url={modelPageUrl(slug)} />
          <Action.OpenInBrowser title="Open Task History" icon={Icon.List} url={TASK_HISTORY_URL} />
        </ActionPanel>
      }
    />
  );
}
