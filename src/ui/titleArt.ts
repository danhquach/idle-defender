// Where things are in the title art (ID-282), in the art's own pixels, so the layout test
// (e2e/intro-art.spec.ts) can check that the title screen shows the three survivors and keeps
// the title and the buttons off them. This file has no imports: the browser test reads it too.
//
// New title art? Re-measure: open the art with a 25 px grid over it and read each survivor's
// box, rifle included, from the top of the head to the soles of the boots. `knee` is the line
// the buttons may come down past (lower legs and ground sit in the page's dark bottom shade).
// src/ui/titleArt.test.ts fails while `size` does not match the art file.

export interface ArtBox {
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly knee: number;
  readonly boots: number;
}

export const TITLE_ART_FOCUS = {
  /** The art file's size (src/assets/art/title-dusk.png). */
  size: [1152, 769],
  /** The three survivors, left to right. */
  survivors: [
    { x0: 28, x1: 178, top: 252, knee: 590, boots: 660 },
    { x0: 162, x1: 332, top: 228, knee: 590, boots: 665 },
    { x0: 333, x1: 472, top: 272, knee: 590, boots: 660 },
  ],
} as const satisfies { size: readonly [number, number]; survivors: readonly ArtBox[] };
