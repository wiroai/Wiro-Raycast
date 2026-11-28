import assert from "node:assert/strict";
import { test } from "node:test";
import {
  workflowFieldIsEmpty,
  workflowFieldValue,
  workflowInputError,
  workflowItemError,
  workflowRunInput,
  type WorkflowInput,
} from "../src/lib/workflow";

function field(change: Partial<WorkflowInput> & Pick<WorkflowInput, "key" | "kind">): WorkflowInput {
  return { label: change.key, options: [], required: false, initialValue: "", hasSavedValue: false, ...change };
}

const select = field({
  key: "style",
  kind: "select",
  options: [
    { value: "photo", title: "Photo" },
    { value: "anime", title: "Anime" },
  ],
});
const savedPrompt = field({ key: "prompt", kind: "text", initialValue: "a red fox", hasSavedValue: true });
const savedSteps = field({ key: "steps", kind: "number", initialValue: "30", hasSavedValue: true });
const savedToken = field({ key: "api_token", kind: "text", initialValue: "", hasSavedValue: true });

test("a dropdown with no saved value sends the option it shows", () => {
  assert.equal(workflowFieldValue(select, {}), "photo");
  assert.deepEqual(workflowRunInput([select], {}), { style: "photo" });
  assert.equal(workflowFieldIsEmpty({ ...select, required: true }, {}), false);
  assert.deepEqual(workflowRunInput([select], { style: "anime" }), { style: "anime" });
});

test("untouched fields keep the saved values", () => {
  assert.deepEqual(workflowRunInput([savedPrompt, savedToken], {}), {});
  assert.equal(workflowFieldIsEmpty({ ...savedPrompt, required: true }, {}), false);
  assert.equal(workflowFieldIsEmpty({ ...savedToken, required: true }, {}), false);
});

test("a cleared text field is sent empty instead of falling back to the saved value", () => {
  assert.deepEqual(workflowRunInput([savedPrompt, savedToken], { prompt: "  ", api_token: "" }), {
    prompt: "",
    api_token: "",
  });
  assert.equal(workflowFieldIsEmpty({ ...savedPrompt, required: true }, { prompt: "" }), true);
  assert.deepEqual(workflowRunInput([savedPrompt], { prompt: "a blue fox" }), { prompt: "a blue fox" });
  assert.deepEqual(workflowRunInput([savedPrompt], { prompt: "a red fox" }), {});
});

test("a cleared number uses the saved value, since there is no empty number", () => {
  assert.deepEqual(workflowRunInput([savedSteps], { steps: "" }), {});
  assert.equal(workflowFieldIsEmpty({ ...savedSteps, required: true }, { steps: "" }), false);
  assert.deepEqual(workflowRunInput([savedSteps], { steps: "12" }), { steps: 12 });
  const unsaved = field({ key: "seed", kind: "number", required: true });
  assert.equal(workflowFieldIsEmpty(unsaved, {}), true);
});

test("checkboxes always send their state", () => {
  const box = field({ key: "upscale", kind: "checkbox", initialValue: "true" });
  assert.deepEqual(workflowRunInput([box], {}), { upscale: true });
  assert.deepEqual(workflowRunInput([box], { upscale: false }), { upscale: false });
});

test("the form checks: files of the input's kind, numbers, and required inputs that reach the run empty", () => {
  const image = field({ key: "photo", kind: "file", fileKind: "image", required: true });
  assert.equal(workflowInputError(image, {}), "Choose a file");
  assert.equal(workflowInputError(image, { photo: ["/tmp/clip.mov"] }), "Choose an image file");
  assert.equal(workflowInputError(image, { photo: ["/tmp/cat.jpg"] }), undefined);
  assert.equal(workflowInputError({ ...image, hasSavedValue: true }, {}), undefined);
  const audio = field({ key: "voice", kind: "file", fileKind: "audio" });
  assert.equal(workflowInputError(audio, { voice: ["/tmp/cat.jpg"] }), "Choose an audio file");
  assert.equal(workflowInputError(audio, {}), undefined);

  assert.equal(workflowInputError(savedSteps, { steps: "many" }), "Enter a number");
  assert.equal(workflowInputError({ ...savedSteps, required: true }, { steps: "" }), undefined);
  assert.equal(workflowInputError({ ...savedPrompt, required: true }, {}), undefined);
  assert.equal(workflowInputError({ ...savedPrompt, required: true }, { prompt: " " }), "Required");
  assert.equal(workflowInputError({ ...select, required: true }, {}), undefined);
});

test("leaving an untouched field that shows its saved value is no error; clearing a typed one is", () => {
  const token = { ...savedToken, required: true };
  // Blur passes the value the field shows: empty, though the run uses the saved token.
  assert.equal(workflowItemError(token, {}, ""), undefined);
  assert.equal(workflowItemError(token, {}), undefined);
  // Typed, then cleared: the run gets it empty.
  assert.equal(workflowItemError(token, { api_token: "abc" }, ""), "Required");
  assert.equal(workflowItemError(token, {}, "abc"), undefined);
  assert.equal(workflowItemError(savedSteps, {}, "many"), "Enter a number");
  const image = field({ key: "photo", kind: "file", fileKind: "image", required: true });
  assert.equal(workflowItemError(image, {}, []), "Choose a file");
  assert.equal(workflowItemError(image, {}, ["/tmp/cat.jpg"]), undefined);
});
