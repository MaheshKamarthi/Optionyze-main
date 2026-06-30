import assert from "node:assert/strict";
import test from "node:test";
import { getDeltaTrailGap, getTrailedDeltaTarget } from "./delta-trailing";

test("sold option trails SL using the original entry-to-SL gap", () => {
    const vGap = getDeltaTrailGap(0.85, 0.90);
    assert.ok(Math.abs(vGap - 0.05) < 1e-12);
    assert.ok(Math.abs(getTrailedDeltaTarget("SELL", "stop-loss", 0.65, vGap) - 0.70) < 1e-12);
});

test("sold option SL triggers when delta rebounds to its trailed target", () => {
    const vTrailedSl = getTrailedDeltaTarget("SELL", "stop-loss", 0.65, getDeltaTrailGap(0.85, 0.90));
    const vTolerance = 1e-9;
    assert.equal(0.69 + vTolerance >= vTrailedSl, false);
    assert.equal(0.70 + vTolerance >= vTrailedSl, true);
});

test("sold option trails TP using the original entry-to-TP gap", () => {
    const vGap = getDeltaTrailGap(0.85, 0.50);
    assert.ok(Math.abs(getTrailedDeltaTarget("SELL", "take-profit", 0.65, vGap) - 0.30) < 1e-12);
});
