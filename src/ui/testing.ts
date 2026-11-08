// Test helpers for the UI wiring.

/** Past the intro (ID-106): its main button, then the first-launch card's, if it opens. */
export function skipIntro(): void {
  const press = (selector: string): void =>
    document.querySelector<HTMLButtonElement>(selector)?.click();
  press('.intro-page:not([hidden]) .btn-primary:not([hidden])');
  press('.intro-card:not([hidden]) .btn-primary');
}
