# Art credits and licences

The game's art (design §15) is generated at development time with the
Pollinations image service and cleaned into sprites by `tools/art/build.py`.
The game ships only the cleaned PNGs in `src/assets/art/` and never calls the
image service at runtime (the page's Content-Security-Policy blocks it). The
build strips each generation's metadata, which records the request, before it
is committed.

This file was checked before any asset was made (ID-043, 2026-10-29). Check it
again before adding a model or when the terms below change.

## Pollinations terms of use

- Source: the Pollinations Terms of Service, "Last updated: 2026-10-10" (the
  terms page on the Pollinations website; the same text is in the open-source
  Pollinations repository, under its legal folder).
- The terms claim no ownership of generated output. Section 8 ("IP &
  Open-Source") covers only the service, its models and documentation, and
  says model licences vary and must be checked before commercial use, which
  the next section does.
- Use limits that apply to us: no infringing IP, likeness or privacy (see
  Originality below), no deepfakes of real people, and the usual abuse rules.
- No attribution is required by the terms; this file credits the service and
  the models anyway.

## Models

Only the models in this allow-list are used. Community-hosted models are not
used. Every entry in `art-src/manifest.json` names its model, and the build
script refuses a model that is not listed here.

| Model (Pollinations name)          | Publisher         | Licence    | Commercial use of output |
| ---------------------------------- | ----------------- | ---------- | ------------------------ |
| `black-forest-labs/flux.1-schnell` | Black Forest Labs | Apache-2.0 | Allowed                  |
| `black-forest-labs/flux.2-klein-4b` | Black Forest Labs | Apache-2.0 | Allowed                  |

- FLUX.1 [schnell]: the model card on Hugging Face
  (`black-forest-labs/FLUX.1-schnell`) states it is "released under the
  `apache-2.0` licence" and "can be used for personal, scientific, and
  commercial purposes".
- FLUX.2 [klein] 4B: the model card on Hugging Face
  (`black-forest-labs/FLUX.2-klein-4B`) states the open weights are
  "available for commercial use under the Apache 2.0 license". (The 9B
  variant has a non-commercial licence and is not on this list.)
- The FLUX names are Black Forest Labs trademarks; we name the models only to
  credit them, never to suggest endorsement.

## Originality

No prompt names an existing game, studio or artist, and no asset copies one.
Prompts describe the subject and a shared house style only
(`art-src/manifest.json`, `style`).

## Credits

- Image generation: Pollinations.
- Models: FLUX.1 [schnell] and FLUX.2 [klein] 4B by Black Forest Labs,
  Apache-2.0.
