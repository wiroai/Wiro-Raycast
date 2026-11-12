import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { showFailureToast, useCachedPromise, useCachedState } from "@raycast/utils";
import { useMemo, useState } from "react";
import {
  fieldParams,
  formatPrice,
  hiddenDefaults,
  imageParameter,
  isListedModel,
  matchPrice,
  modelFields,
  promptParameter,
  validateField,
  type ModelField,
} from "../lib/params";
import { credentials } from "../lib/preferences";
import { getModel, listModels, mimeType, modelPageUrl, modelSlug, runModel, type UploadFile } from "../lib/wiro";
import { TaskView, type MediaKind } from "./task-view";

export type VideoSource = "text" | "image";

interface ModelChoice {
  slug: string;
  title: string;
}

async function loadModels(category: string): Promise<ModelChoice[]> {
  const { models } = await listModels({ categories: [category], limit: 100 });
  return models
    .map((model) => ({ slug: modelSlug(model), title: model.title }))
    .filter((model) => isListedModel(model.slug, model.title));
}

/** Picked when nothing was chosen before and the model is in the list: well-known models with low prices. */
const STARTER_MODELS: Record<string, string[]> = {
  "text-to-image": ["openai/gpt-image-2", "google/nano-banana-2-1", "bytedance/seedream-v5-lite"],
  "text-to-video": ["bytedance/seedance-v1-pro-fast", "pruna/p-video-2", "klingai/kling-v4-flash"],
  "image-to-video": ["bytedance/seedance-v1-pro-fast", "pruna/p-video-2", "klingai/kling-v4-flash"],
};

function categoryFor(kind: MediaKind, source: VideoSource): string {
  if (kind === "image") return "text-to-image";
  return source === "image" ? "image-to-video" : "text-to-video";
}

function summary(text: string | undefined): string | undefined {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  if (clean.length <= 220) return clean;
  const cut = clean.slice(0, 220);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : 220)}…`;
}

interface GenerateFormProps {
  kind: MediaKind;
  /** A model to start with, such as one picked in Search Models. */
  initialModel?: string;
  initialSource?: VideoSource;
}

export function GenerateForm({ kind, initialModel, initialSource }: GenerateFormProps) {
  const { push } = useNavigation();
  const [cachedSource, setCachedSource] = useCachedState<VideoSource>("video-source", "text");
  const [sourceOverride, setSourceOverride] = useState<VideoSource | undefined>(initialSource);
  const source: VideoSource = kind === "video" ? (sourceOverride ?? cachedSource) : "text";
  const category = categoryFor(kind, source);

  const [storedSlug, setStoredSlug] = useCachedState<string>(`model-${category}`, "");
  const [chosenSlug, setChosenSlug] = useState<string | undefined>(initialModel?.trim().toLowerCase());

  const [prompt, setPrompt] = useState("");
  const [promptError, setPromptError] = useState<string>();
  const [imageFiles, setImageFiles] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string>();
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: models, isLoading: modelsLoading } = useCachedPromise(loadModels, [category], {
    keepPreviousData: false,
    failureToastOptions: { title: "Could not load the models" },
  });

  const starter = STARTER_MODELS[category]?.find((id) => models?.some((choice) => choice.slug === id));
  const slug = chosenSlug || storedSlug || starter || models?.[0]?.slug;

  const { data: model, isLoading: modelLoading } = useCachedPromise(getModel, [slug ?? ""], {
    execute: Boolean(slug),
    failureToastOptions: { title: "Could not load the model settings" },
  });
  const currentModel = model && slug && modelSlug(model).toLowerCase() === slug.toLowerCase() ? model : undefined;

  const fields = useMemo(() => (currentModel ? modelFields(currentModel) : []), [currentModel]);
  const promptParam = currentModel ? promptParameter(currentModel) : undefined;
  const imageParam = currentModel && kind === "video" && source === "image" ? imageParameter(currentModel) : undefined;

  const key = (field: ModelField) => `${slug}::${field.id}`;
  const valueOf = (field: ModelField) => values[key(field)] ?? field.defaultValue;
  const fieldValues = Object.fromEntries(fields.map((field) => [field.id, valueOf(field)]));
  const shownIds = [...fields.map((field) => field.id), promptParam?.id, imageParam?.id].filter((id): id is string =>
    Boolean(id),
  );
  const runParams = currentModel
    ? { ...hiddenDefaults(currentModel, shownIds), ...fieldParams(fields, fieldValues) }
    : {};
  const priceText = currentModel ? formatPrice(matchPrice(currentModel, runParams)) : undefined;

  const choices: ModelChoice[] = [...(models ?? [])];
  if (slug && !choices.some((choice) => choice.slug === slug)) choices.unshift({ slug, title: slug });

  function chooseModel(next: string) {
    if (!next || next === slug) return;
    setChosenSlug(next);
    setStoredSlug(next);
  }

  function chooseSource(next: string) {
    const value: VideoSource = next === "image" ? "image" : "text";
    if (value === source) return;
    setSourceOverride(undefined);
    setCachedSource(value);
    setChosenSlug(undefined);
    setImageError(undefined);
  }

  async function submit() {
    if (!currentModel || !slug || isSubmitting) return;
    const promptRequired = kind === "image" || source === "text" || Boolean(promptParam?.required);
    let valid = true;

    if (!promptParam) {
      await showFailureToast(new Error(`${slug} takes no text prompt. Pick another model.`), {
        title: "This model needs other inputs",
      });
      return;
    }
    if (promptRequired && !prompt.trim()) {
      setPromptError("Write a prompt");
      valid = false;
    }
    if (kind === "video" && source === "image") {
      if (!imageParam) {
        await showFailureToast(new Error(`${slug} takes no image. Pick another model.`), {
          title: "This model has no image input",
        });
        return;
      }
      if (imageFiles.length === 0) {
        setImageError("Choose an image");
        valid = false;
      } else if (!mimeType(imageFiles[0]).startsWith("image/")) {
        setImageError("Choose a PNG, JPEG, WebP or GIF file");
        valid = false;
      }
    }
    const errors: Record<string, string | undefined> = {};
    for (const field of fields) {
      const error = validateField(field, valueOf(field));
      if (error) {
        errors[field.id] = error;
        valid = false;
      }
    }
    setFieldErrors(errors);
    if (!valid) return;

    const params: Record<string, unknown> = { ...runParams };
    if (prompt.trim()) params[promptParam.id] = prompt.trim();
    const files: UploadFile[] =
      imageParam && imageFiles[0] ? [{ field: imageParam.id, path: imageFiles[0], type: imageParam.type }] : [];

    setIsSubmitting(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Starting task" });
    try {
      const run = await runModel(slug, params, credentials(), files);
      await toast.hide();
      push(<TaskView kind={kind} slug={slug} run={run} prompt={prompt.trim()} />);
    } catch (error) {
      await toast.hide();
      await showFailureToast(error, { title: "Could not start the task" });
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderField(field: ModelField) {
    const id = key(field);
    const error = fieldErrors[field.id];
    const onChange = (value: string | boolean) => {
      setValues((previous) => ({ ...previous, [id]: value }));
      if (error) setFieldErrors((previous) => ({ ...previous, [field.id]: undefined }));
    };
    switch (field.kind) {
      case "dropdown":
        return (
          <Form.Dropdown
            key={id}
            id={id}
            title={field.title}
            info={field.info}
            value={String(valueOf(field))}
            onChange={onChange}
          >
            {field.options.map((option) => (
              <Form.Dropdown.Item key={option.value} value={option.value} title={option.title} />
            ))}
          </Form.Dropdown>
        );
      case "checkbox":
        return (
          <Form.Checkbox
            key={id}
            id={id}
            label={field.title}
            info={field.info}
            value={valueOf(field) === true}
            onChange={onChange}
          />
        );
      default:
        return (
          <Form.TextField
            key={id}
            id={id}
            title={field.title}
            info={field.info}
            placeholder={field.placeholder}
            error={error}
            value={String(valueOf(field))}
            onChange={onChange}
          />
        );
    }
  }

  const noun = kind === "image" ? "Image" : "Video";

  return (
    <Form
      isLoading={modelsLoading || modelLoading || isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={`Generate ${noun}`} icon={Icon.Wand} onSubmit={submit} />
          {slug && <Action.OpenInBrowser title="Open Model Page" icon={Icon.Globe} url={modelPageUrl(slug)} />}
        </ActionPanel>
      }
    >
      {kind === "video" && (
        <Form.Dropdown id="source" title="Source" value={source} onChange={chooseSource}>
          <Form.Dropdown.Item value="text" title="Text to Video" icon={Icon.Text} />
          <Form.Dropdown.Item value="image" title="Image to Video" icon={Icon.Image} />
        </Form.Dropdown>
      )}
      <Form.Dropdown
        id={`model-${category}`}
        title="Model"
        info="Models from the Wiro AI catalog. Search Models finds more."
        value={slug ?? ""}
        onChange={chooseModel}
      >
        {choices.length === 0 ? (
          <Form.Dropdown.Item value="" title="Loading models…" />
        ) : (
          choices.map((choice) => (
            <Form.Dropdown.Item key={choice.slug} value={choice.slug} title={choice.slug} keywords={[choice.title]} />
          ))
        )}
      </Form.Dropdown>
      {currentModel && summary(currentModel.description || currentModel.seodescription) && (
        <Form.Description text={summary(currentModel.description || currentModel.seodescription) ?? ""} />
      )}
      {kind === "video" && source === "image" && currentModel && !imageParam && (
        <Form.Description title="Image" text="This model takes no image. Pick another model." />
      )}
      {kind === "video" && source === "image" && (!currentModel || imageParam) && (
        <Form.FilePicker
          id="image"
          title="Image"
          info="The model starts the video from this image."
          allowMultipleSelection={false}
          canChooseDirectories={false}
          value={imageFiles}
          error={imageError}
          onChange={(files) => {
            setImageFiles(files);
            setImageError(undefined);
          }}
        />
      )}
      <Form.TextArea
        id="prompt"
        title="Prompt"
        placeholder={
          kind === "image"
            ? "A lighthouse on a rocky coast at sunrise, soft light"
            : "A slow aerial shot over a misty pine forest at dawn"
        }
        info={kind === "video" && source === "image" ? "Describe the motion and the camera." : undefined}
        value={prompt}
        error={promptError}
        onChange={(text) => {
          setPrompt(text);
          if (promptError) setPromptError(undefined);
        }}
      />
      {fields.length > 0 && <Form.Separator />}
      {fields.map(renderField)}
      {priceText && <Form.Description title="Price" text={priceText} />}
    </Form>
  );
}
