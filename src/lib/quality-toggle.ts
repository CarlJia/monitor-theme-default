/** Whether the list page shows the network quality bands. Default off. */

const KEY = "quality"

export function readQualityOn(storage: Storage = globalThis.localStorage): boolean {
  // Anything other than the literal "true" — including hand-edits, old values,
  // and the absent key — falls back to off, the default.
  return storage.getItem(KEY) === "true"
}

export function saveQualityOn(on: boolean, storage: Storage = globalThis.localStorage): void {
  storage.setItem(KEY, on ? "true" : "false")
}
