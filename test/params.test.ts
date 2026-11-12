import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fieldParams,
  formatPrice,
  hiddenDefaults,
  imageParameter,
  isListedModel,
  matchPrice,
  modelFields,
  priceEntries,
  promptParameter,
  startingPrice,
  titleCase,
  validateField,
} from "../src/lib/params";
import type { WiroModel } from "../src/lib/wiro";

// Shaped like Tool/Detail for an image model with a price list.
const imageModel: WiroModel = {
  id: "1",
  title: "Example Image",
  cleanslugowner: "acme",
  cleanslugproject: "image-1",
  parameters: [
    {
      title: "Inputs",
      items: [
        { id: "inputImage", type: "combinefileinput", label: "Input Images", defaultvalue: "https://example.com/sample.png" },
        { id: "prompt", type: "textarea", label: "Prompt", required: true, defaultvalue: "A sample prompt" },
        {
          id: "resolution",
          type: "select",
          label: "Resolution",
          required: true,
          defaultvalue: "1k",
          options: [
            { value: "1k", text: "1K" },
            { value: "2k", text: "2K" },
          ],
        },
        {
          id: "quality",
          type: "select",
          label: "quality",
          required: true,
          advanced: true,
          defaultvalue: "low",
          options: [
            { value: "low", text: "Low" },
            { value: "high", text: "High" },
          ],
        },
        { id: "samples", type: "number", label: "Number of Images", required: true, advanced: true, defaultvalue: "1", minvalue: "1", maxvalue: "10" },
        { id: "outputFormat", type: "select", label: "Output Format", advanced: true, defaultvalue: "png", options: [{ value: "png", text: "PNG" }] },
        { id: "negativePrompt", type: "text", label: "Negative Prompt", placeholder: "What to avoid", defaultvalue: "sample words" },
      ],
    },
  ],
  dynamicprice: [
    { inputs: { quality: "low", resolution: "1k" }, price: 0.006, priceMethod: "cpr" },
    { inputs: { quality: "high", resolution: "1k" }, price: 0.211, priceMethod: "cpr" },
    { inputs: { quality: "low", resolution: "2k" }, price: 0.012, priceMethod: "cpr" },
  ],
};

// Shaped like Tool/Detail for a video model whose image input is optional.
const videoModel: WiroModel = {
  id: "2",
  title: "Example Video",
  cleanslugowner: "acme",
  cleanslugproject: "video-1",
  parameters: [
    {
      items: [
        { id: "lastFrameImage", type: "combinefileinput", label: "Last Frame Image", advanced: true },
        { id: "inputImage", type: "combinefileinput", label: "First Frame" },
        { id: "prompt", type: "textarea", label: "prompt" },
        { id: "duration", type: "select", label: "duration", required: true, defaultvalue: "5", options: [{ value: "5" }, { value: "10" }] },
        { id: "watermark", type: "checkbox", label: "Watermark", defaultvalue: "false" },
      ],
    },
  ],
  dynamicprice: '[{"inputs":{"duration":"5"},"price":0.47,"priceMethod":"cpr"},{"inputs":{"duration":"10"},"price":0.94,"priceMethod":"cpr"}]',
};

test("prompt and image inputs are found", () => {
  assert.equal(promptParameter(imageModel)?.id, "prompt");
  assert.equal(imageParameter(videoModel)?.id, "inputImage");
  assert.equal(imageParameter({ parameters: [] }), undefined);
});

test("the form shows default settings and the advanced ones that change the price", () => {
  const fields = modelFields(imageModel);
  assert.deepEqual(
    fields.map((field) => field.id),
    ["resolution", "quality", "negativePrompt"],
  );
  const quality = fields.find((field) => field.id === "quality");
  assert.equal(quality?.title, "Quality");
  assert.equal(quality?.defaultValue, "low");
  const negative = fields.find((field) => field.id === "negativePrompt");
  assert.equal(negative?.defaultValue, "", "text samples are never prefilled");
});

test("required settings the form hides get their catalog defaults, samples do not", () => {
  const shown = modelFields(imageModel).map((field) => field.id);
  assert.deepEqual(hiddenDefaults(imageModel, [...shown, "prompt"]), { samples: 1 });
  assert.deepEqual(hiddenDefaults(videoModel, []), { duration: "5" });
});

test("prices match the chosen settings", () => {
  assert.equal(priceEntries(videoModel).length, 2, "string price lists are parsed");
  assert.equal(formatPrice(matchPrice(imageModel, { resolution: "1k", quality: "high" })), "$0.211 per run");
  assert.equal(formatPrice(matchPrice(imageModel, { resolution: "2k", quality: "low" })), "$0.012 per run");
  assert.equal(formatPrice(matchPrice(videoModel, { duration: 10 })), "$0.94 per run");
  assert.equal(matchPrice(imageModel, { resolution: "4k", quality: "low" }), undefined);
  assert.equal(
    formatPrice({ method: "cp-readoutput", amount: 0, note: "Billed by token usage" }),
    "Billed by token usage",
  );
  assert.equal(startingPrice(imageModel), 0.006);
});

test("form values become run parameters", () => {
  const fields = modelFields(videoModel);
  assert.deepEqual(fieldParams(fields, { duration: "10", watermark: true }), { duration: "10", watermark: "true" });
  const numberField = modelFields({
    parameters: [{ items: [{ id: "steps", type: "number", label: "Steps", minvalue: 1, maxvalue: 50, defaultvalue: 20 }] }],
  })[0];
  assert.equal(numberField.defaultValue, "20");
  assert.equal(validateField(numberField, "0"), "Minimum is 1");
  assert.equal(validateField(numberField, "2.5"), "Enter a whole number");
  assert.equal(validateField(numberField, "abc"), "Enter a number");
  assert.equal(validateField(numberField, "30"), undefined);
  assert.deepEqual(fieldParams([numberField], { steps: "" }), {});
});

test("labels are title cased", () => {
  assert.equal(titleCase("duration"), "Duration");
  assert.equal(titleCase("aspectRatio"), "Aspect Ratio");
  assert.equal(titleCase("output_format"), "Output Format");
});

test("adult-content models stay out of the lists", () => {
  assert.equal(isListedModel("openai/gpt-image-2"), true);
  assert.equal(isListedModel("acme/model-uncensored"), false);
  assert.equal(isListedModel("acme/model", "Model Uncensored Edition"), false);
});
