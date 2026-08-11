type Task = () => Promise<void>;

interface PendingTask {
  run: Task;
  resolve: () => void;
  reject: (error: unknown) => void;
}

export interface LatestTaskQueue {
  enqueue: (task: Task) => Promise<void>;
}

export function createLatestTaskQueue(): LatestTaskQueue {
  let active = false;
  let pending: PendingTask | null = null;

  const drain = async () => {
    if (active) return;
    active = true;

    try {
      while (pending) {
        const next = pending;
        pending = null;
        try {
          await next.run();
          next.resolve();
        } catch (error) {
          next.reject(error);
        }
      }
    } finally {
      active = false;
      if (pending) void drain();
    }
  };

  return {
    enqueue(task) {
      return new Promise<void>((resolve, reject) => {
        // Only the newest task waiting behind the active request needs to run.
        // Superseded callers resolve because their state is represented by the
        // newer pending task.
        pending?.resolve();
        pending = { run: task, resolve, reject };
        void drain();
      });
    },
  };
}
