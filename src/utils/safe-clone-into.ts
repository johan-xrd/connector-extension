export const safeCloneInto = <T>(detail: T, targetWindow: Window): T => {
  if (typeof cloneInto === 'function') {
    return cloneInto(detail, targetWindow)
  }
  return detail
}
