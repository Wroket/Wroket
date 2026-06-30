import { afterEach, describe, expect, it, vi } from "vitest";

describe("todosDriftMonitor lazy boot", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
    vi.resetModules();
  });

  it("skips RAM vs v2 comparison when TODOS_BOOT_HYDRATION=lazy", async () => {
    process.env.TODOS_STORAGE_MODE = "v2";
    process.env.TODOS_BOOT_HYDRATION = "lazy";
    process.env.USE_LOCAL_STORE = "true";

    const { startTodosDriftMonitor, getTodosDriftStatus, stopTodosDriftMonitor } = await import("./todosDriftMonitor");
    startTodosDriftMonitor();
    await new Promise((r) => setTimeout(r, 50));
    stopTodosDriftMonitor();

    expect(getTodosDriftStatus().status).toBe("skipped_lazy_boot");
  });
});
