# Audio credits and licences

Checked for ID-080 (2026-11-05). Check again before adding any sound file.

- **Source:** every sound in the game, music and effects, is synthesised in
  the browser at runtime by `src/ui/audio.ts` with the Web Audio API
  (oscillators and filtered noise). The noise comes from the game's own
  seeded RNG.
- **Files:** none. The repository ships no audio files and the page loads
  none (the Content-Security-Policy has no `media-src`).
- **Music:** the two loops are original note patterns written for this game
  in `src/ui/audio.ts` (`SONGS`); they quote no existing tune.
- **Licence:** the sounds are part of the game's own code and carry its
  licence. No third-party sample, library or service is used, so no
  attribution is owed.
