import { describe, expect, test } from "bun:test";
import { createLatestTaskQueue } from "./latest-task-queue.ts";

describe("latest task queue", () => {
  test("serializes active work and runs only the newest pending task", async () => {
    const queue = createLatestTaskQueue();
    const calls = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.enqueue(async () => {
      calls.push("first:start");
      await firstGate;
      calls.push("first:end");
    });
    const superseded = queue.enqueue(async () => {
      calls.push("superseded");
    });
    const latest = queue.enqueue(async () => {
      calls.push("latest");
    });

    releaseFirst();
    await Promise.all([first, superseded, latest]);

    expect(calls).toEqual(["first:start", "first:end", "latest"]);
  });

  test("continues processing after a failed task", async () => {
    const queue = createLatestTaskQueue();
    const calls = [];
    let releaseFailure;
    const failureGate = new Promise((resolve) => {
      releaseFailure = resolve;
    });

    const failed = queue.enqueue(async () => {
      calls.push("failed");
      await failureGate;
      throw new Error("expected failure");
    });
    const recovered = queue.enqueue(async () => {
      calls.push("recovered");
    });

    releaseFailure();
    await expect(failed).rejects.toThrow("expected failure");
    await recovered;
    expect(calls).toEqual(["failed", "recovered"]);
  });
});
