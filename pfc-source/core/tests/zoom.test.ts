import { test } from "node:test";
import assert from "node:assert/strict";
import { zoomStep } from "../src/zoom.ts";

test("zoom steps move to the next preset level", () => {
  assert.equal(zoomStep(1, 1), 1.25);
  assert.equal(zoomStep(1, -1), 0.8);
  // from an in-between scale (e.g. fit at 87%), go to the nearest level that way
  assert.equal(zoomStep(0.87, 1), 1);
  assert.equal(zoomStep(0.87, -1), 0.8);
});

test("zoom steps stop at the limits", () => {
  assert.equal(zoomStep(3, 1), 3);
  assert.equal(zoomStep(0.25, -1), 0.25);
  assert.equal(zoomStep(5, -1), 3);
});
