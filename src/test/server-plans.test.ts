import { createRequire } from "module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { getMonthlyWindow } = require("../../server/lib/plans.js");

describe("getMonthlyWindow", () => {
  it("keeps the active billing window when it still contains the current date", () => {
    const now = new Date("2026-05-11T10:00:00.000Z");
    const currentStart = new Date(2026, 4, 1).toISOString();
    const currentEnd = new Date(2026, 5, 1).toISOString();

    expect(getMonthlyWindow({
      currentPeriodStart: currentStart,
      currentPeriodEnd: currentEnd,
    }, now)).toEqual({
      start: currentStart,
      end: currentEnd,
    });
  });

  it("rolls stale billing windows forward to the current month", () => {
    const now = new Date("2026-05-11T10:00:00.000Z");

    expect(getMonthlyWindow({
      currentPeriodStart: new Date(2026, 3, 1).toISOString(),
      currentPeriodEnd: new Date(2026, 4, 1).toISOString(),
    }, now)).toEqual({
      start: new Date(2026, 4, 1).toISOString(),
      end: new Date(2026, 5, 1).toISOString(),
    });
  });
});
