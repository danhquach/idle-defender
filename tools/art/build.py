"""Cleans generated art into the game's sprites (design §15, ID-043).

Inputs: art-src/manifest.json (prompt, model, seed, size and reference of every
asset) and art-src/gen/<id>.jpg (the generations it records). Outputs:
src/assets/art/<id>.png, bundled with the build.

  python3 tools/art/build.py          # build everything
  python3 tools/art/build.py <id>...  # build only these

Needs Python 3 with Pillow (12) and numpy (2). Generation happens by hand at development
time (never at runtime): each generation is the manifest prompt, a period and the
style named by its kind, with its model, seed and size; an asset with `ref` is an
edit of that asset's generation. The image service key lives in `.env`
(git-ignored). Models are limited to the allow-list in docs/art-credits.md.
Generations carry the request (prompt, references, service URLs) in their
metadata: the build strips every metadata segment from art-src/gen/*.jpg and
art-concepts/*.jpg in place, so none of it is committed.

Manifest asset keys (unknown keys stop the build):

  id*, kind* ("sprite" or "texture"), model*, seed*, size*, prompt*,
  ref (id of the generation it edits), flip (mirror left to right),
  mutant (keep its colours saturated; everything else is muted, §15),
  group (sprites in one group share one scale, so a raised weapon doesn't
  shrink a body).

A sprite has its magenta background keyed out to transparency, only its
biggest shape kept (detached parts under KEEP of it are dropped), and is
trimmed to its content and scaled so its longer side is SPRITE_PX; a group is
scaled so its biggest member's longer side is SPRITE_PX. A texture is made to
tile and scaled to TEXTURE_PX square.
"""

import json
import re
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "art-src" / "manifest.json"
GEN = ROOT / "art-src" / "gen"
OUT = ROOT / "src" / "assets" / "art"
CREDITS = ROOT / "docs" / "art-credits.md"

KEYS = {"id", "kind", "model", "seed", "size", "prompt", "ref", "flip", "mutant", "group"}
CONCEPTS = ROOT / "art-concepts"
REQUIRED = {"id", "kind", "model", "seed", "size", "prompt"}
SPRITE_PX = 192
TEXTURE_PX = 256
# Ruins are muted (§15); only mutants keep their saturated colours.
MUTED = 0.7
# How magenta a pixel is: min(red, blue) - green. At or above KEY_OUT it is
# background; at or below KEY_IN it is kept; between, it is part see-through.
KEY_IN, KEY_OUT = 50, 110
# Shapes smaller than this share of the biggest one are dropped as specks.
KEEP = 0.04


def allowed_models() -> set[str]:
    """The models listed in the art credits' table (the allow-list)."""
    rows = re.findall(r"^\|\s*`([^`]+)`\s*\|", CREDITS.read_text(), re.MULTILINE)
    if not rows:
        sys.exit("art-credits.md lists no models")
    return set(rows)


def key_out(img: Image.Image) -> Image.Image:
    """The magenta background made transparent, its pink fringe pulled back to neutral."""
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    magenta = np.minimum(r, b) - g
    alpha = np.clip((KEY_OUT - magenta) / (KEY_OUT - KEY_IN), 0, 1)
    spill = np.clip(magenta - 10, 0, None) * (1 - alpha * 0.5)
    rgb = np.stack([r - spill, g, b - spill], axis=-1).clip(0, 255)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def keep_biggest(img: Image.Image) -> Image.Image:
    """Clears every opaque shape smaller than KEEP of the biggest one."""
    a = np.asarray(img).copy()
    solid = a[..., 3] > 128
    labels = np.zeros(solid.shape, np.int32)
    sizes = [0]
    h, w = solid.shape
    for y0, x0 in zip(*np.nonzero(solid)):
        if labels[y0, x0]:
            continue
        n = len(sizes)
        labels[y0, x0] = n
        queue, count = deque([(y0, x0)]), 0
        while queue:
            y, x = queue.popleft()
            count += 1
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = n
                    queue.append((ny, nx))
        sizes.append(count)
    biggest = max(sizes)
    small = [i for i, s in enumerate(sizes) if i and s < biggest * KEEP]
    kept = solid & ~np.isin(labels, small)
    # Faint edge pixels stay only within a few px of a kept shape.
    near = Image.fromarray((kept * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))
    a[~kept & (np.asarray(near) == 0), 3] = 0
    a[np.isin(labels, small), 3] = 0
    return Image.fromarray(a, "RGBA")


def strip_metadata(path: Path) -> None:
    """Rewrites a JPEG without its APPn (but the JFIF header) and comment segments."""
    data = path.read_bytes()
    out, i = bytearray(data[:2]), 2
    while i + 4 <= len(data) and data[i] == 0xFF:
        marker = data[i + 1]
        if marker == 0xDA:  # start of scan: the image data runs to the end
            out += data[i:]
            break
        end = i + 2 + int.from_bytes(data[i + 2 : i + 4], "big")
        if not (0xE1 <= marker <= 0xEF or marker == 0xFE):
            out += data[i:end]
        i = end
    else:
        sys.exit(f"{path.name}: not a JPEG this build can read")
    if out != data:
        path.write_bytes(out)


def prepare(img: Image.Image, asset: dict) -> Image.Image:
    """A sprite keyed out, cleaned, trimmed, flipped and muted, at its source size."""
    img = keep_biggest(key_out(img))
    box = img.getbbox()
    if box is None:
        sys.exit(f"{asset['id']}: nothing left after keying out the background")
    img = img.crop(box)
    if asset.get("flip"):
        img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if not asset.get("mutant"):
        rgb, alpha = img.convert("RGB"), img.getchannel("A")
        img = ImageEnhance.Color(rgb).enhance(MUTED)
        img.putalpha(alpha)
    return img


def scaled(img: Image.Image, scale: float) -> Image.Image:
    size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    return img.resize(size, Image.Resampling.LANCZOS)


def texture(img: Image.Image) -> Image.Image:
    """Tiles without seams: blended with itself shifted half a tile, the seams faded out."""
    img = ImageEnhance.Color(img.convert("RGB")).enhance(MUTED)
    side = min(img.size)
    img = img.crop((0, 0, side, side))
    a = np.asarray(img).astype(np.float32)
    shifted = np.roll(a, (side // 2, side // 2), axis=(0, 1))
    # Weight 1 at the centre of the tile, 0 at its edges, where the seams are.
    ramp = 1 - np.abs(np.linspace(-1, 1, side))
    weight = np.minimum.outer(ramp, ramp)[..., None]
    out = a * weight + shifted * (1 - weight)
    tile = Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGB")
    return tile.resize((TEXTURE_PX, TEXTURE_PX), Image.Resampling.LANCZOS)


def check(asset: dict, models: set[str], ids: set[str]) -> None:
    unknown = set(asset) - KEYS
    missing = REQUIRED - set(asset)
    name = asset.get("id", "?")
    if unknown or missing:
        sys.exit(f"{name}: unknown keys {sorted(unknown)}, missing {sorted(missing)}")
    if asset["model"] not in models:
        sys.exit(f"{name}: model {asset['model']} is not in the art-credits allow-list")
    if asset["kind"] not in ("sprite", "texture"):
        sys.exit(f"{name}: kind must be sprite or texture")
    if "ref" in asset and asset["ref"] not in ids:
        sys.exit(f"{name}: ref {asset['ref']} is not an asset")
    if not re.fullmatch(r"[a-z]+(-[a-z]+)*", name):
        sys.exit(f"{name}: ids are lower-case words joined by hyphens")


def main(only: list[str]) -> None:
    manifest = json.loads(MANIFEST.read_text())
    assets = manifest["assets"]
    ids = {a["id"] for a in assets}
    models = allowed_models()
    for asset in assets:
        check(asset, models, ids)
    unknown = set(only) - ids
    if unknown:
        sys.exit(f"not in the manifest: {sorted(unknown)}")
    for jpg in [*GEN.glob("*.jpg"), *CONCEPTS.glob("*.jpg")]:
        strip_metadata(jpg)
    OUT.mkdir(parents=True, exist_ok=True)
    built: dict[str, Image.Image] = {}
    for asset in assets:
        src_path = GEN / f"{asset['id']}.jpg"
        if not src_path.exists():
            sys.exit(f"{asset['id']}: no generation at art-src/gen/{asset['id']}.jpg")
        src = Image.open(src_path)
        built[asset["id"]] = prepare(src, asset) if asset["kind"] == "sprite" else texture(src)
    # A group shares one scale; any other sprite is scaled on its own.
    longest: dict[str, int] = {}
    for asset in assets:
        if asset["kind"] == "sprite":
            key = asset.get("group", asset["id"])
            longest[key] = max(longest.get(key, 0), *built[asset["id"]].size)
    for asset in assets:
        if only and asset["id"] not in only:
            continue
        img = built[asset["id"]]
        if asset["kind"] == "sprite":
            img = scaled(img, SPRITE_PX / longest[asset.get("group", asset["id"])])
        img.save(OUT / f"{asset['id']}.png", optimize=True)
        print(f"{asset['id']}: {img.width}x{img.height}")


if __name__ == "__main__":
    main(sys.argv[1:])
