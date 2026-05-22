import { useCallback, useEffect, useState } from "react";

type WxtStorageItem<T> = {
  getValue: () => Promise<T>;
  setValue: (value: T) => Promise<void>;
  watch: (cb: (newValue: T) => void) => () => void;
};

export function useStorageItem<T>(
  item: WxtStorageItem<T>
): [T | undefined, (value: T | ((prev: T) => T)) => Promise<void>] {
  const [value, setValue] = useState<T | undefined>(undefined);

  useEffect(() => {
    // Initial read
    item.getValue().then((v) => setValue(v));
    // Subscribe to changes
    const unwatch = item.watch((newVal) => setValue(newVal));
    return unwatch;
  }, [item]);

  const set = useCallback(
    async (updater: T | ((prev: T) => T)) => {
      const next =
        typeof updater === "function"
          ? (updater as (prev: T) => T)(await item.getValue())
          : updater;

      setValue(next);
      await item.setValue(next);
    },
    [item]
  );

  return [value, set];
}
