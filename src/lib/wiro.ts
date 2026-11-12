import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

export const API_BASE_URL = "https://api.wiro.ai/v1";
export const SITE_URL = "https://wiro.ai";
export const USER_AGENT = "Wiro-Raycast/1.0";

export interface Credentials {
  apiKey: string;
  apiSecret?: string;
}

export class WiroError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "WiroError";
    this.status = status;
  }
}

export interface ToolParameterOption {
  value?: string | number;
  text?: string;
  label?: string;
  id?: string | number;
  name?: string;
}

export interface ToolParameter {
  id: string;
  type: string;
  label?: string;
  description?: string;
  placeholder?: string;
  note?: string;
  required?: boolean;
  advanced?: boolean;
  defaultvalue?: unknown;
  options?: ToolParameterOption[];
  minvalue?: string | number;
  maxvalue?: string | number;
}

export interface ToolParameterGroup {
  title?: string;
  items?: ToolParameter[];
}

export interface PriceEntry {
  inputs?: Record<string, string | number | boolean>;
  price?: number | string;
  priceMethod?: string;
  note?: string;
}

export interface WiroModel {
  id: string;
  title: string;
  cleanslugowner: string;
  cleanslugproject: string;
  description?: string;
  seodescription?: string;
  categories?: string[];
  image?: string;
  computingtime?: string;
  parameters?: ToolParameterGroup[] | null;
  dynamicprice?: PriceEntry[] | string | null;
  taskstat?: { runcount?: number | string } | null;
}

export interface TaskOutput {
  name?: string;
  contenttype?: string;
  size?: string;
  url?: string;
}

export interface Task {
  id: string;
  socketaccesstoken: string;
  status: string;
  pexit?: string;
  debugerror?: string;
  elapsedseconds?: string;
  totalcost?: string;
  outputs?: TaskOutput[];
  modelslugowner?: string;
  modelslugproject?: string;
}

export interface RunResult {
  taskid: string;
  tasktoken: string;
}

export interface UploadFile {
  /** The model parameter the file goes to, such as `inputImage`. */
  field: string;
  /** Path of a local file. */
  path: string;
  /** Wiro parameter type of `field`, from Tool/Detail. */
  type: string;
}

interface WiroEnvelope {
  result?: boolean;
  errors?: Array<{ message?: string }>;
}

/** `owner/project` of a catalog model, as model pages and the Run API use it. */
export function modelSlug(model: Pick<WiroModel, "cleanslugowner" | "cleanslugproject">): string {
  return `${model.cleanslugowner}/${model.cleanslugproject}`;
}

export function modelPageUrl(slug: string): string {
  return `${SITE_URL}/models/${slug}`;
}

export function splitSlug(slug: string): [string, string] {
  const [owner, ...rest] = slug.trim().split("/");
  const project = rest.join("/");
  if (!owner || !project) {
    throw new WiroError(`"${slug}" is not a model ID. Use the owner/model form, such as openai/gpt-image-2.`);
  }
  return [owner, project];
}

/** Headers for one Run API request. Signature projects sign every request with a fresh nonce. */
export function runApiHeaders(credentials: Credentials): Record<string, string> {
  const apiKey = credentials.apiKey.trim();
  const apiSecret = credentials.apiSecret?.trim();
  const headers: Record<string, string> = { "x-api-key": apiKey, "User-Agent": USER_AGENT };
  if (apiSecret) {
    const nonce = Date.now().toString();
    headers["x-nonce"] = nonce;
    headers["x-signature"] = createHmac("sha256", apiKey)
      .update(apiSecret + nonce)
      .digest("hex");
  }
  return headers;
}

function envelopeError(body: WiroEnvelope, fallback: string): string {
  const messages = (body.errors ?? []).map((error) => error?.message?.trim()).filter(Boolean);
  return messages.length > 0 ? messages.join(", ") : fallback;
}

function httpErrorMessage(status: number, text: string, credentials?: Credentials): string {
  let message = text.trim();
  try {
    const body = JSON.parse(text) as WiroEnvelope & { message?: string };
    message = envelopeError(body, body.message ?? message);
  } catch {
    if (/^\s*</.test(message)) message = "";
  }
  if (status === 401 && credentials && !credentials.apiSecret?.trim() && /signature/i.test(text)) {
    return "This project uses signature-based authentication. Add its API secret in the extension preferences.";
  }
  if (status === 401 || status === 403) {
    return message ? `Wiro AI rejected the API key: ${message}` : "Wiro AI rejected the API key.";
  }
  return message ? `Wiro AI error ${status}: ${message}` : `Wiro AI error ${status}`;
}

async function readJson<T extends WiroEnvelope>(response: Response, credentials?: Credentials): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new WiroError(httpErrorMessage(response.status, text, credentials), response.status);
  }
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    throw new WiroError("Wiro AI sent an answer that could not be read.");
  }
  if (body.result === false) {
    throw new WiroError(envelopeError(body, "Wiro AI could not complete the request."));
  }
  return body;
}

async function post<T extends WiroEnvelope>(
  path: string,
  body: Record<string, unknown>,
  credentials?: Credentials,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = credentials ? runApiHeaders(credentials) : { "User-Agent": USER_AGENT };
  headers["Content-Type"] = "application/json";
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  return readJson<T>(response, credentials);
}

export interface ListModelsOptions {
  search?: string;
  categories?: string[];
  start?: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface ModelPage {
  models: WiroModel[];
  total: number;
}

/** Searches the public catalog. No API key is needed. */
export async function listModels(options: ListModelsOptions = {}): Promise<ModelPage> {
  const body = await post<WiroEnvelope & { tool?: WiroModel[]; total?: number | string }>(
    "/Tool/List",
    {
      start: String(options.start ?? 0),
      limit: String(options.limit ?? 30),
      search: options.search ?? "",
      categories: options.categories ?? [],
      sort: "relevance",
      hideworkflows: true,
      summary: true,
    },
    undefined,
    options.signal,
  );
  return { models: body.tool ?? [], total: Number(body.total ?? 0) || 0 };
}

/** One model with its parameters and price list. No API key is needed. */
export async function getModel(slug: string, signal?: AbortSignal): Promise<WiroModel> {
  const [slugowner, slugproject] = splitSlug(slug);
  const body = await post<WiroEnvelope & { tool?: WiroModel[] }>(
    "/Tool/Detail",
    { slugowner, slugproject },
    undefined,
    signal,
  );
  const model = body.tool?.[0];
  if (!model) throw new WiroError(`Wiro AI has no model called ${slug}.`);
  return model;
}

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

export function mimeType(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** The companion URL field of a file parameter, which multipart runs send empty. */
export function urlField(id: string, type: string): string | undefined {
  if (type === "fileinput") return `${id}Url`;
  if (type === "multifileinput")
    return id.endsWith("Multiple") ? `${id.slice(0, -"Multiple".length)}UrlMultiple` : `${id}Url`;
  return undefined;
}

function formValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

/** Starts a model run. Parameters go as JSON, or as multipart form data when files are attached. */
export async function runModel(
  slug: string,
  params: Record<string, unknown>,
  credentials: Credentials,
  files: UploadFile[] = [],
  signal?: AbortSignal,
): Promise<RunResult> {
  const [owner, project] = splitSlug(slug);
  const url = `${API_BASE_URL}/Run/${encodeURIComponent(owner)}/${encodeURIComponent(project)}`;
  let response: Response;

  if (files.length === 0) {
    response = await fetch(url, {
      method: "POST",
      headers: { ...runApiHeaders(credentials), "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal,
    });
  } else {
    const form = new FormData();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      form.append(key, formValue(value));
    }
    for (const file of files) {
      const data = await readFile(file.path);
      form.append(file.field, new Blob([data], { type: mimeType(file.path) }), basename(file.path));
      const companion = urlField(file.field, file.type);
      if (companion) form.append(companion, "");
    }
    response = await fetch(url, { method: "POST", headers: runApiHeaders(credentials), body: form, signal });
  }

  const body = await readJson<WiroEnvelope & { taskid?: string | number; socketaccesstoken?: string }>(
    response,
    credentials,
  );
  if (!body.socketaccesstoken) {
    throw new WiroError(
      body.taskid
        ? `Wiro AI started task ${body.taskid} but did not send its token. Find the result in your task history.`
        : "Wiro AI did not start the task.",
    );
  }
  return { taskid: String(body.taskid ?? ""), tasktoken: body.socketaccesstoken };
}

export async function getTask(tasktoken: string, credentials: Credentials, signal?: AbortSignal): Promise<Task> {
  const body = await post<WiroEnvelope & { tasklist?: Task[] }>("/Task/Detail", { tasktoken }, credentials, signal);
  const task = body.tasklist?.[0];
  if (!task) throw new WiroError("Wiro AI did not return the task.");
  return task;
}

/** Cancels a queued task, or stops one that already runs. Stopped tasks are not charged. */
export async function stopTask(task: Pick<Task, "id" | "status">, credentials: Credentials): Promise<void> {
  const path = task.status === "task_queue" ? "/Task/Cancel" : "/Task/Kill";
  await post(path, { taskid: task.id }, credentials);
}

export const TERMINAL_STATUSES = new Set(["task_postprocess_end", "task_cancel"]);

export function isFinished(task: Pick<Task, "status">): boolean {
  return TERMINAL_STATUSES.has(task.status);
}

export function isSuccessful(task: Pick<Task, "status" | "pexit">): boolean {
  return task.status === "task_postprocess_end" && String(task.pexit ?? "") === "0";
}

/** A short, human label for a task status. */
export function statusLabel(status: string): string {
  switch (status) {
    case "task_queue":
      return "Waiting in queue";
    case "task_accept":
    case "task_preprocess_start":
    case "task_preprocess_end":
    case "task_assign":
    case "task_error":
      return "Preparing";
    case "task_start":
    case "task_output":
    case "task_output_full":
    case "task_error_full":
      return "Generating";
    case "task_end":
    case "task_postprocess_start":
      return "Finishing";
    case "task_postprocess_end":
      return "Done";
    case "task_cancel":
      return "Cancelled";
    default:
      return "Starting";
  }
}

/** How often to ask for a task's status, by how long it has been running. */
export function pollInterval(elapsedMs: number): number {
  if (elapsedMs < 15_000) return 2_000;
  if (elapsedMs < 60_000) return 4_000;
  return 8_000;
}

/** Why a finished task has no result, in words the user can act on. */
export function failureReason(task: Task): string {
  if (task.status === "task_cancel") return "The task was cancelled.";
  const detail = (task.debugerror ?? "").trim().split("\n").filter(Boolean).pop();
  return detail ? detail.slice(0, 300) : "The model could not finish this task.";
}

export function mediaOutputs(task: Pick<Task, "outputs">, kind: "image" | "video"): TaskOutput[] {
  const pattern = kind === "image" ? /\.(png|jpe?g|webp|gif|bmp|tiff?|heic)$/i : /\.(mp4|mov|webm|m4v|mkv)$/i;
  return (task.outputs ?? []).filter((output) => {
    if (!output.url) return false;
    const type = (output.contenttype ?? "").toLowerCase();
    if (type.startsWith(`${kind}/`)) return true;
    const path = output.url.split("?")[0];
    return pattern.test(path) || pattern.test(output.name ?? "");
  });
}

/** A dollar amount with two decimals, or up to four for amounts under a dollar. */
export function formatUsd(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  const text = amount.toFixed(amount < 0.01 ? 4 : 3).replace(/0+$/, "");
  const [whole, fraction = ""] = text.split(".");
  return `$${whole}.${fraction.padEnd(2, "0")}`;
}

export function formatCost(value: string | number | undefined): string | undefined {
  const cost = Number(value);
  if (!Number.isFinite(cost) || cost <= 0) return undefined;
  return formatUsd(cost);
}

export function formatSeconds(value: string | number | undefined): string | undefined {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`;
}
