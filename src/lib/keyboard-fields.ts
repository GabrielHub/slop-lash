/** Fields that raise a phone keyboard. */
export const KEYBOARD_FIELDS =
  "textarea, [contenteditable=''], [contenteditable='true'], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=reset]):not([type=color]):not([type=file])";

/** Whether `element` is a field that raises a phone keyboard. */
export function typingIn(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element.matches(KEYBOARD_FIELDS);
}
