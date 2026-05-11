declare function cloneInto<T>(
  obj: T,
  targetScope: Window,
  options?: { cloneFunctions?: boolean },
): T
