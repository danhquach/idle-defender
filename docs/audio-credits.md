# Audio credits and licences

Checked for ID-080 (2026-11-05). Check again before adding any sound file.

## Gun shots: recordings

The seven files in `src/assets/sounds/` are cut from **The Free Firearm Sound
Library** ("Prepared SFX Library"), recorded by Ben Jaszczak, Brian Nelson,
Kevin Heras and Matthew Nanney.

- **Licence:** CC0 1.0 (public domain dedication). The library's own notice
  says the team "holds CC0 NO RIGHTS RESERVED for this library" and that it
  may be used without royalty or credit for any application. Credit is given
  here anyway.
- **Where it came from:** the OpenGameArt page "The Free Firearm Sound
  Library", https://opengameart.org/content/the-free-firearm-sound-library
  (licence field: CC0, checked 2026-11-05), file `Prepared SFX Library.7z`
  (193,954,738 bytes, SHA-256
  `cc1ab5a99a0a365105c7c5dd783f4b0b1fe90938114d3ceec53856bfe005f7d6`),
  downloaded 2026-11-05. The original project site is offline; OpenGameArt
  keeps the copy.
- **How the clips are made:** `tools/audio/cut.py` finds each source file by
  its library name, mixes it to mono, cuts one shot with a fade-out, sets its
  peak and encodes a 96 kbps MP3 with no ID3 or APE tags (only the encoder's
  own header). With ffmpeg 8.1.2 in bit-exact mode it rebuilds the committed
  files byte for byte from the unpacked library; another ffmpeg version may
  encode slightly different bytes of the same sound.

| File | Library file | What it is |
| --- | --- | --- |
| `shot-pistol.mp3` | `X_39P.wav` | 9 mm semi-automatic pistol, near |
| `shot-smg.mp3` | `G_31P.wav` | 9 mm sub-machine gun, single shot, near |
| `shot-rifle.mp3` | `D_32P.wav` | 5.56 mm semi-automatic carbine, near |
| `shot-shotgun.mp3` | `O_21P.wav` | 12 gauge pump-action shotgun, near |
| `shot-lmg.mp3` | `C_28P.wav` | 7.62x39 mm automatic rifle, single shot, near |
| `shot-sniper.mp3` | `M_21P.wav` | 7.62x54 mm bolt-action rifle, near |
| `shot-turret.mp3` | `R_35P.wav` | .22 semi-automatic pistol, near |

## Everything else: made in code

- The music and every other effect are synthesised in the browser at runtime
  by `src/ui/audio.ts` with the Web Audio API (oscillators and filtered
  noise; the noise comes from the game's seeded RNG). The made-in-code gun
  shots stay as the fallback while a recording loads or if it fails.
- The two music loops are original note patterns written for this game
  (`SONGS` in `src/ui/audio.ts`); they quote no existing tune.
- These sounds are part of the game's own code and carry its licence.

## Loading

The recordings are fetched from the page's own origin and decoded with Web
Audio, which the Content-Security-Policy's `connect-src 'self'` already
allows; no `media-src` is needed.
