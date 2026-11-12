import { Action, ActionPanel, Form, Icon, showToast, Toast, useNavigation } from "@raycast/api";
import { showFailureToast, useCachedPromise } from "@raycast/utils";
import { useRef, useState } from "react";
import { fileMatchesKind } from "../lib/params";
import { credentials } from "../lib/preferences";
import { getWorkflow, runWorkflow, uploadFile } from "../lib/wiro";
import { parseWorkflow, type WorkflowInput } from "../lib/workflow";
import { WorkflowRun } from "./workflow-run";

/** The inputs of one workflow, then a run. */
export function WorkflowForm({ fullSlug }: { fullSlug: string }) {
  const { push } = useNavigation();
  const {
    data: workflow,
    isLoading,
    error,
  } = useCachedPromise(async (slug: string) => parseWorkflow(await getWorkflow(slug, credentials())), [fullSlug], {
    failureToastOptions: { title: "Could not load the workflow" },
  });
  const [values, setValues] = useState<Record<string, string | boolean | string[]>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const valueOf = (input: WorkflowInput) => {
    if (input.key in values) return values[input.key];
    if (input.kind === "checkbox") return input.initialValue === "true";
    if (input.kind === "file") return [];
    return input.initialValue;
  };

  function setValue(key: string, value: string | boolean | string[]) {
    setValues((previous) => ({ ...previous, [key]: value }));
    if (errors[key]) setErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  async function submit() {
    if (submittingRef.current || !workflow) return;
    const nextErrors: Record<string, string | undefined> = {};
    for (const input of workflow.inputs) {
      const value = valueOf(input);
      if (input.kind === "file") {
        const paths = value as string[];
        if (input.required && paths.length === 0 && !input.hasSavedValue) nextErrors[input.key] = "Choose a file";
        else if (paths.some((path) => !fileMatchesKind(path, input.fileKind ?? "file"))) {
          nextErrors[input.key] =
            `Choose ${input.fileKind === "audio" ? "an audio" : `a ${input.fileKind ?? "file"}`} file`;
        }
      } else if (input.kind === "number" && String(value).trim() && !Number.isFinite(Number(value))) {
        nextErrors[input.key] = "Enter a number";
      } else if (input.required && !input.hasSavedValue && input.kind !== "checkbox" && !String(value ?? "").trim()) {
        nextErrors[input.key] = "Required";
      }
    }
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Starting the workflow" });
    try {
      const input: Record<string, unknown> = {};
      for (const field of workflow.inputs) {
        const value = valueOf(field);
        if (field.kind === "file") {
          const paths = value as string[];
          if (paths.length === 0) continue;
          toast.message = `Uploading ${paths.length} file${paths.length > 1 ? "s" : ""}`;
          const urls = [];
          for (const path of paths) urls.push(await uploadFile(path, credentials()));
          input[field.key] = urls.length === 1 ? urls[0] : urls;
        } else if (field.kind === "checkbox") {
          input[field.key] = value === true;
        } else if (field.kind === "number") {
          if (String(value).trim()) input[field.key] = Number(value);
        } else if (String(value ?? "").trim() && value !== field.initialValue) {
          input[field.key] = String(value).trim();
        }
      }
      const token = await runWorkflow(workflow.fullSlug, input, credentials());
      await toast.hide();
      push(<WorkflowRun workflow={workflow} token={token} />);
    } catch (runError) {
      await toast.hide();
      await showFailureToast(runError, { title: "Could not start the workflow" });
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  function renderInput(input: WorkflowInput) {
    const common = { id: input.key, title: input.label, info: input.description, error: errors[input.key] };
    const value = valueOf(input);
    switch (input.kind) {
      case "file":
        return (
          <Form.FilePicker
            key={input.key}
            {...common}
            allowMultipleSelection={false}
            canChooseDirectories={false}
            value={value as string[]}
            onChange={(paths) => setValue(input.key, paths)}
          />
        );
      case "select":
        return (
          <Form.Dropdown
            key={input.key}
            id={input.key}
            title={input.label}
            info={input.description}
            value={String(value) || input.options[0]?.value || ""}
            onChange={(next) => setValue(input.key, next)}
          >
            {input.options.map((option) => (
              <Form.Dropdown.Item key={option.value} value={option.value} title={option.title} />
            ))}
          </Form.Dropdown>
        );
      case "checkbox":
        return (
          <Form.Checkbox
            key={input.key}
            id={input.key}
            label={input.label}
            info={input.description}
            value={value === true}
            onChange={(next) => setValue(input.key, next)}
          />
        );
      case "longtext":
        return (
          <Form.TextArea
            key={input.key}
            {...common}
            placeholder={input.label}
            value={String(value)}
            onChange={(next) => setValue(input.key, next)}
          />
        );
      default:
        return (
          <Form.TextField
            key={input.key}
            {...common}
            placeholder={input.label}
            value={String(value)}
            onChange={(next) => setValue(input.key, next)}
          />
        );
    }
  }

  return (
    <Form
      isLoading={isLoading || isSubmitting}
      navigationTitle={workflow?.title ?? "Run Workflow"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Run Workflow" icon={Icon.Play} onSubmit={submit} />
          {workflow && <Action.OpenInBrowser title="Open Workflow Page" icon={Icon.Globe} url={workflow.url} />}
        </ActionPanel>
      }
    >
      {error && !workflow && <Form.Description title="Error" text={error.message} />}
      {workflow?.description && <Form.Description text={workflow.description.slice(0, 400)} />}
      {workflow && workflow.inputs.length === 0 && <Form.Description text="This workflow takes no inputs." />}
      {workflow?.inputs.map(renderInput)}
      {workflow && (
        <Form.Description
          title="Price"
          text={`Each of its ${workflow.stepCount} steps is charged at its model's price when it runs.`}
        />
      )}
    </Form>
  );
}
