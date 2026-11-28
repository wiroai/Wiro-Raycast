import assert from "node:assert/strict";
import { test } from "node:test";
import { matchingRow, priceLine, priceRows, quote, startingPrice, startingPriceText } from "../src/lib/price";

const perRun = {
  dynamicprice: [
    { inputs: { quality: "low", resolution: "1k" }, price: 0.006, priceMethod: "per-run" },
    { inputs: { quality: "high", resolution: "1k" }, price: 0.211, priceMethod: "per-run" },
  ],
};

test("the row for the chosen settings sets the price", () => {
  assert.equal(quote(perRun, { quality: "high", resolution: "1k" }).label, "$0.211");
  assert.equal(quote(perRun, { quality: "low", resolution: "1k" }).amount, 0.006);
  assert.equal(quote(perRun, { quality: "medium", resolution: "4k" }).label, "by run time");
});

test("price lists sent as JSON strings are read too", () => {
  assert.equal(priceRows({ dynamicprice: '[{"inputs":{},"price":0.035,"priceMethod":"per-output-file"}]' }).length, 1);
});

test("per-output-file, per-character, per-input-second and per-output-video-second prices", () => {
  const perOutput = { dynamicprice: [{ inputs: {}, price: 0.035, priceMethod: "per-output-file" }] };
  assert.equal(quote(perOutput, {}).label, "$0.035");
  assert.equal(quote(perOutput, { samples: 3 }).label, "$0.105 for 3 output files");
  assert.equal(quote(perOutput, {}).note, "$0.035 per output file.");

  const perCharacter = { dynamicprice: [{ inputs: {}, price: 0.00004, priceMethod: "per-input-character" }] };
  assert.equal(quote(perCharacter, {}).label, "$0.00004 / character");
  assert.equal(quote(perCharacter, {}, { promptChars: 500 }).label, "$0.02 for 500 characters");
  assert.equal(quote(perCharacter, {}).note, "$0.00004 per prompt character.");

  const perAudioSecond = { dynamicprice: [{ inputs: {}, price: 0.0003, priceMethod: "per-input-audio-second" }] };
  assert.equal(quote(perAudioSecond, {}).label, "$0.0003 / audio second");
  assert.equal(quote(perAudioSecond, {}).note, "$0.0003 per second of input audio.");

  const perVideoSecond = { dynamicprice: [{ inputs: {}, price: 0.1, priceMethod: "per-output-video-second" }] };
  assert.equal(quote(perVideoSecond, { duration: "5" }).label, "$0.50");
  assert.equal(quote(perVideoSecond, {}).note, "$0.10 per second of output video.");
});

test("a price per second of input video counts each input at most maxSeconds", () => {
  const vsr = {
    dynamicprice: [
      { inputs: { resolution: "720p" }, price: 0.015, priceMethod: "per-input-video-second", maxSeconds: 60 },
      { inputs: { resolution: "1080p" }, price: 0.025, priceMethod: "per-input-video-second", maxSeconds: 60 },
    ],
  };
  const unknown = quote(vsr, { resolution: "1080p" });
  assert.equal(unknown.label, "$0.025 / video second");
  assert.equal(unknown.note, "$0.025 per second of input video. Each input counts at most 60 seconds.");

  const short = quote(vsr, { resolution: "720p" }, { mediaSeconds: 20 });
  assert.equal(short.label, "about $0.30 for 20 seconds of input video");
  assert.equal(short.note, "$0.015 per second of input video.");

  const long = quote(vsr, { resolution: "720p" }, { mediaSeconds: 90 });
  assert.equal(long.label, "about $0.90 for 60 seconds of input video");
  assert.equal(
    long.note,
    "$0.015 per second of input video. Only the first 60 seconds of each input are processed and billed.",
  );

  // Without maxSeconds the whole input counts.
  const audio = { dynamicprice: [{ inputs: {}, price: 0.0003, priceMethod: "per-input-audio-second" }] };
  assert.equal(quote(audio, {}, { mediaSeconds: 100 }).label, "about $0.03 for 100 seconds of input audio");
});

test("every method shows its words, and an old id is billed by run time", () => {
  const one = (priceMethod: string) => ({ dynamicprice: [{ inputs: {}, price: 0.5, priceMethod }] });
  assert.equal(quote(one("per-run-second"), {}).label, "$0.50 / second");
  assert.equal(quote(one("per-total-token"), {}).label, "by tokens");
  assert.equal(quote(one("per-output-megapixel"), {}).label, "from $0.50");
  assert.equal(quote(one("reported-price"), {}).label, "about $0.50");
  assert.equal(quote(one("per-realtime-turn"), {}).label, "per conversation turn");
  for (const old of [
    "cpr",
    "cps",
    "cpo",
    "cpt",
    "cp-pixel",
    "cp-promptlength",
    "cp-audiosecondslength",
    "cp-outputVideoLength",
    "cp-realtimeturn",
    "cp-readoutput",
    "cp",
    "cp-request",
    "cp-image",
    "cp-frame",
    "cp-byte",
  ]) {
    assert.equal(quote(one(old), {}).label, "by run time", old);
  }
});

test("rows that count files bill the valid row with the highest count", () => {
  const rows = priceRows({
    dynamicprice: [
      { inputs: { inputImage: "QUANTITY:0" }, price: 0.03, priceMethod: "per-run" },
      { inputs: { inputImage: "QUANTITY:1" }, price: 0.05, priceMethod: "per-run" },
      { inputs: { inputImage: "QUANTITY:3" }, price: 0.09, priceMethod: "per-run" },
    ],
  });
  assert.equal(matchingRow(rows, {})?.price, 0.03);
  assert.equal(matchingRow(rows, { inputImage: ["a"] })?.price, 0.05);
  assert.equal(matchingRow(rows, { inputImage: ["a", "b"] })?.price, 0.05);
  assert.equal(matchingRow(rows, { inputImage: ["a", "b", "c"] })?.price, 0.09);
});

test("models without a price list are billed by run time", () => {
  assert.equal(quote({ approximatelycost: "0.0132" }, {}).label, "about $0.013");
  assert.equal(quote({ cps: "0.0005" }, {}).label, "$0.0005 / second");
  assert.equal(quote({}, {}).label, "by run time");
  assert.equal(quote({ dynamicprice: [{ inputs: {}, price: 0, priceMethod: "per-run" }] }, {}).label, "Free");
});

test("the caller's discount lowers the price and shows on the line", () => {
  const discounted = quote({ ...perRun, discount: 20 }, { quality: "high", resolution: "1k" });
  assert.equal(discounted.amount?.toFixed(4), "0.1688");
  assert.equal(priceLine(discounted), "$0.169 (20% off)");
  assert.equal(priceLine(quote(perRun, { quality: "low", resolution: "1k" })), "$0.006");
});

test("starting prices for the search list", () => {
  assert.deepEqual(startingPrice(perRun), { amount: 0.006, method: "per-run" });
  assert.equal(startingPriceText(perRun), "From $0.006 per run");
  assert.equal(
    startingPriceText({ dynamicprice: [{ inputs: {}, price: 0.035, priceMethod: "per-output-file" }] }),
    "From $0.035 per output file",
  );
  assert.equal(startingPriceText({ approximatelycost: 0.0218 }), "About $0.022 per run");
  assert.equal(startingPriceText({}), undefined);
});

test("an output count setting multiplies a per-output price", () => {
  const perOutput = { dynamicprice: [{ inputs: {}, price: 0.035, priceMethod: "per-output-file" }] };
  assert.equal(quote(perOutput, { maxImages: 2 }).label, "$0.07 for 2 output files");
});
