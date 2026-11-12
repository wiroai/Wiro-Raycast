import { formatUsd, type PriceEntry, type ToolParameter, type ToolParameterOption, type WiroModel } from "./wiro";

export const FILE_TYPES = new Set(["fileinput", "multifileinput", "combinefileinput"]);
const SELECT_TYPES = new Set(["select", "selectwithcover"]);
const NUMBER_TYPES = new Set(["number", "float", "range"]);
const TEXT_TYPES = new Set(["text", "textarea"]);

/** Models that are kept out of the pickers and the search list. */
const HIDDEN_MODEL = /uncensored|heretic|obliterated|nsfw/i;

export function isListedModel(slug: string, title = ""): boolean {
  return !HIDDEN_MODEL.test(slug) && !HIDDEN_MODEL.test(title);
}

export interface FieldOption {
  value: string;
  title: string;
}

export type FieldKind = "dropdown" | "checkbox" | "number" | "text";

/** One model setting shown in a form. */
export interface ModelField {
  id: string;
  kind: FieldKind;
  title: string;
  info?: string;
  placeholder?: string;
  required: boolean;
  defaultValue: string | boolean;
  options: FieldOption[];
  min?: number;
  max?: number;
  integer: boolean;
}

export function allParameters(model: Pick<WiroModel, "parameters">): ToolParameter[] {
  return (model.parameters ?? []).flatMap((group) => group?.items ?? []).filter((item) => Boolean(item?.id));
}

/** The price list of a model; Tool/List sends it as a JSON string and Tool/Detail as an array. */
export function priceEntries(model: Pick<WiroModel, "dynamicprice">): PriceEntry[] {
  const value = model.dynamicprice;
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as PriceEntry[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Settings that change the price, which the form shows even when the catalog marks them advanced. */
export function priceInputs(model: Pick<WiroModel, "dynamicprice">): Set<string> {
  const ids = new Set<string>();
  for (const entry of priceEntries(model)) {
    for (const key of Object.keys(entry.inputs ?? {})) ids.add(key);
  }
  return ids;
}

/** The text parameter the prompt goes to. */
export function promptParameter(model: Pick<WiroModel, "parameters">): ToolParameter | undefined {
  const items = allParameters(model);
  const positive = (item: ToolParameter) => !/negative/i.test(item.id) && !/negative/i.test(item.label ?? "");
  return (
    items.find((item) => item.id === "prompt") ??
    items.find((item) => item.type === "textarea" && /prompt/i.test(item.id) && positive(item)) ??
    items.find((item) => item.type === "textarea" && !item.advanced && positive(item))
  );
}

/** The file parameter a source image goes to: the first image-like file input. */
export function imageParameter(model: Pick<WiroModel, "parameters">): ToolParameter | undefined {
  const files = allParameters(model).filter((item) => FILE_TYPES.has(item.type));
  const looksLikeImage = (item: ToolParameter) =>
    /image|frame|photo|picture/i.test(item.id) || /image|frame|photo|picture/i.test(item.label ?? "");
  return (
    files.find((item) => !item.advanced && looksLikeImage(item) && !/last|end|mask/i.test(item.id)) ??
    files.find((item) => looksLikeImage(item) && !/last|end|mask/i.test(item.id))
  );
}

function optionValue(option: ToolParameterOption): string | undefined {
  const value = option.value ?? option.id;
  return value === undefined || value === null ? undefined : String(value);
}

function optionTitle(option: ToolParameterOption, value: string): string {
  return String(option.text ?? option.label ?? option.name ?? value);
}

export function titleCase(text: string): string {
  return text
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function toField(item: ToolParameter): ModelField | undefined {
  const title = titleCase(item.label?.trim() || item.id);
  const info = [item.description, item.note].map((text) => text?.trim()).find(Boolean);
  const required = Boolean(item.required);

  if (SELECT_TYPES.has(item.type)) {
    const options: FieldOption[] = [];
    for (const option of item.options ?? []) {
      const value = optionValue(option);
      if (value === undefined || options.some((existing) => existing.value === value)) continue;
      options.push({ value, title: optionTitle(option, value) });
    }
    if (options.length === 0) return undefined;
    const fallback = String(item.defaultvalue ?? "");
    const defaultValue = options.some((option) => option.value === fallback) ? fallback : options[0].value;
    return { id: item.id, kind: "dropdown", title, info, required, defaultValue, options, integer: false };
  }

  if (item.type === "checkbox") {
    const value = String(item.defaultvalue ?? "").toLowerCase();
    return {
      id: item.id,
      kind: "checkbox",
      title,
      info,
      required: false,
      defaultValue: value === "true" || value === "1",
      options: [],
      integer: false,
    };
  }

  if (NUMBER_TYPES.has(item.type)) {
    const min = numberOrUndefined(item.minvalue);
    const max = numberOrUndefined(item.maxvalue);
    const fallback = numberOrUndefined(item.defaultvalue);
    const range = min !== undefined && max !== undefined ? `${min} to ${max}` : undefined;
    return {
      id: item.id,
      kind: "number",
      title,
      info: [info, range ? `Allowed values: ${range}.` : undefined].filter(Boolean).join(" ") || undefined,
      placeholder: range ?? item.placeholder,
      required,
      defaultValue: fallback === undefined ? "" : String(fallback),
      options: [],
      min,
      max,
      integer: item.type !== "float",
    };
  }

  if (TEXT_TYPES.has(item.type)) {
    return {
      id: item.id,
      kind: "text",
      title,
      info,
      placeholder: item.placeholder?.trim() || title,
      required,
      defaultValue: "",
      options: [],
      integer: false,
    };
  }

  return undefined;
}

/**
 * The settings a form shows for a model: everything the catalog shows by default, plus the
 * advanced settings that change the price. Prompt and file inputs have their own fields.
 */
export function modelFields(model: Pick<WiroModel, "parameters" | "dynamicprice">): ModelField[] {
  const prompt = promptParameter(model)?.id;
  const pricing = priceInputs(model);
  const fields: ModelField[] = [];
  for (const item of allParameters(model)) {
    if (item.id === prompt || FILE_TYPES.has(item.type)) continue;
    if (item.advanced && !pricing.has(item.id)) continue;
    const field = toField(item);
    if (field && !fields.some((existing) => existing.id === field.id)) fields.push(field);
  }
  return fields;
}

/**
 * Defaults for required settings the form does not show, so the run validates. Only selects,
 * numbers and checkboxes are filled: text and file defaults in the catalog are samples.
 */
export function hiddenDefaults(
  model: Pick<WiroModel, "parameters">,
  shownIds: Iterable<string>,
): Record<string, string | number> {
  const shown = new Set(shownIds);
  const values: Record<string, string | number> = {};
  for (const item of allParameters(model)) {
    if (shown.has(item.id) || !item.required) continue;
    const fallback = item.defaultvalue;
    if (fallback === undefined || fallback === null || fallback === "") continue;
    if (NUMBER_TYPES.has(item.type)) {
      const number = numberOrUndefined(fallback);
      if (number !== undefined) values[item.id] = item.type === "float" ? number : Math.round(number);
    } else if (SELECT_TYPES.has(item.type) || item.type === "checkbox") {
      values[item.id] = String(fallback);
    }
  }
  return values;
}

/** Checks one form value; returns an error message or undefined. */
export function validateField(field: ModelField, value: unknown): string | undefined {
  if (field.kind === "number") {
    const text = String(value ?? "").trim();
    if (!text) return field.required ? "Required" : undefined;
    const number = Number(text);
    if (!Number.isFinite(number)) return "Enter a number";
    if (field.integer && !Number.isInteger(number)) return "Enter a whole number";
    if (field.min !== undefined && number < field.min) return `Minimum is ${field.min}`;
    if (field.max !== undefined && number > field.max) return `Maximum is ${field.max}`;
    return undefined;
  }
  if (field.kind === "text" && field.required && !String(value ?? "").trim()) return "Required";
  return undefined;
}

/** Turns form values into Run parameters. Empty optional fields are left out. */
export function fieldParams(fields: ModelField[], values: Record<string, unknown>): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const field of fields) {
    const value = values[field.id];
    if (field.kind === "checkbox") {
      params[field.id] = value === true ? "true" : "false";
    } else if (field.kind === "number") {
      const text = String(value ?? "").trim();
      if (text) params[field.id] = Number(text);
    } else {
      const text = String(value ?? "").trim();
      if (text) params[field.id] = text;
    }
  }
  return params;
}

export interface Price {
  amount?: number;
  method?: string;
  note?: string;
}

/** The price list entry that matches the chosen settings, if the model has one. */
export function matchPrice(model: Pick<WiroModel, "dynamicprice">, values: Record<string, unknown>): Price | undefined {
  const entries = priceEntries(model);
  const match = entries.find((entry) =>
    Object.entries(entry.inputs ?? {}).every(
      ([key, expected]) => String(values[key] ?? "").toLowerCase() === String(expected).toLowerCase(),
    ),
  );
  if (!match) return undefined;
  const amount = Number(match.price);
  return {
    amount: Number.isFinite(amount) ? amount : undefined,
    method: match.priceMethod,
    note: match.note?.trim() || undefined,
  };
}

/** Price methods with a fixed amount: per run, and per output file. */
const FIXED_METHODS = new Set(["cpr", "cpo"]);

/**
 * A price as people read it, such as "$0.05 per run". `output` names what a per-output price
 * counts, such as "image". Prices without a fixed amount show the catalog's own note.
 */
export function formatPrice(price: Price | undefined, output = "output"): string | undefined {
  if (!price) return undefined;
  if (price.method && FIXED_METHODS.has(price.method) && price.amount !== undefined && price.amount > 0) {
    return `${formatUsd(price.amount)} per ${price.method === "cpo" ? output : "run"}`;
  }
  return price.note;
}

/** The lowest fixed price in a model's price list, for the search list. */
export function startingPrice(model: Pick<WiroModel, "dynamicprice">): Price | undefined {
  let lowest: Price | undefined;
  for (const entry of priceEntries(model)) {
    const amount = Number(entry.price);
    if (!entry.priceMethod || !FIXED_METHODS.has(entry.priceMethod) || !Number.isFinite(amount) || amount <= 0)
      continue;
    if (!lowest || amount < (lowest.amount ?? Infinity)) lowest = { amount, method: entry.priceMethod };
  }
  return lowest;
}
