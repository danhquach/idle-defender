// Test helpers for the UI wiring.

/** Past the intro (ID-106): its main button, then the first-launch card's, if it opens. */
export function skipIntro(): void {
  const press = (selector: string): void =>
    document.querySelector<HTMLButtonElement>(selector)?.click();
  press('.intro-page:not([hidden]) .btn-primary:not([hidden])');
  press('.intro-card:not([hidden]) .btn-primary');
}

/** A turn of the event loop: what a pending async handler (an answered confirm) needs to finish. */
export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The in-game confirm panel (ID-191) that is up, or null. */
export const confirmPanel = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('.confirm-scrim');

/** Its question; throws when no panel is up, so a missing ask fails loudly. */
export function confirmQuestion(): string {
  const q = confirmPanel()?.querySelector('.confirm-question');
  if (!q) throw new Error('no confirm panel is up');
  return q.textContent ?? '';
}

/** Presses Confirm (or Cancel) on the panel and lets the answer through; returns the question. */
export async function answerConfirm(yes: boolean): Promise<string> {
  const question = confirmQuestion();
  confirmPanel()!
    .querySelector<HTMLButtonElement>(yes ? '.confirm-yes' : '.confirm-no')!
    .click();
  await flush();
  return question;
}
