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
  ref (id of the generation it edits, or a list of ids it combines: the
  first is the subject, the others what it takes on, ID-046), photo (a public
  domain photograph the generation was drawn from, credited in
  docs/art-credits.md under its id), flip (mirror left to right),
  mutant (keep its colours saturated; everything else is muted, §15),
  white (drain every colour, so a glow painted with coloured rays reads as plain
  white light and keeps no pink from the background it was keyed out of, ID-041),
  group (sprites in one group share one scale, so a raised weapon doesn't
  shrink a body), palette (id of a texture whose colours this texture takes
  on, so two surfaces read as one ground), edge (id of a texture this one is a
  variant of: it takes on that texture's colours and shares its seam border,
  so any variant tiles next to any other, ID-050), part (a generation used only
  inside other sprites as a reference, never written out itself; ID-046: a Gunner
  holding each gun is drawn from the weaponless body part and that weapon's part),
  style (the manifest style to use instead of its kind's: a
  weapon on its own is generated with the `object` style; the empty `verbatim`
  style means the prompt was sent as it is, with no style added), ajar (a
  gate generated closed and straight, top to bottom, has its two leaves swung
  a little open toward the field, ID-054: `hinges` are the generation's rows
  where the leaves meet their posts, `seam` the row where they meet each other,
  `swing` how far right a leaf's free end moves per row of its length, and
  `length` the share of its length a swung leaf still shows from above; the
  passage the leaves leave behind is filled with PASSAGE).

A sprite has its magenta background keyed out to transparency, only its
biggest shape kept (detached parts under KEEP of it are dropped), and is
trimmed to its content and scaled so its longer side is SPRITE_PX; a group is
scaled so its biggest member's longer side is SPRITE_PX. A texture is made to
tile and scaled to TEXTURE_PX square; a variant family (a texture and those
with it as `edge`) shares only a narrow border, so each variant keeps most of
its own look.
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

KEYS = {
    "id", "kind", "model", "seed", "size", "prompt", "ref", "flip", "mutant", "group",
    "palette", "edge", "part", "style", "photo", "ajar", "white",
}
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
# The shadowed way through an ajar gate (ID-054), and the share of its sprite's width
# its posts fill: the rest is room for the leaves. src/ui/sprites.ts `GATE_POSTS` must
# be the same number.
PASSAGE = (28, 22, 18)
GATE_POSTS = 0.6
# A variant family blends to its shared border over the outer 1 / NARROW of each
# half tile; any other texture blends over the whole half.
NARROW = 4


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


def ajar(img: Image.Image, spec: dict) -> Image.Image:
    """
    A closed straight gate with each leaf swung out to the right about its post: a
    leaf's rows shift right the further they are from its hinge, and it shows only
    `length` of itself, so a gap opens between the leaves onto the passage.
    """
    a = np.asarray(img.convert("RGB")).astype(np.int16)
    solid = (np.minimum(a[..., 0], a[..., 2]) - a[..., 1]) < KEY_IN
    out = a.copy()
    (top, bottom), seam = spec["hinges"], spec["seam"]
    if bottom >= a.shape[0]:
        sys.exit(f"ajar: bottom hinge {bottom} is past the generation's {a.shape[0]} rows")
    out[top:bottom][solid[top:bottom]] = PASSAGE
    for y in range(top, bottom):
        upper = y < seam
        hinge, span = (top, seam - top) if upper else (bottom, bottom - seam)
        shown = abs(y - hinge)
        if shown > spec["length"] * span:
            continue
        along = shown / spec["length"]
        src = round(hinge + along if upper else hinge - along)
        xs = np.nonzero(solid[src])[0]
        to = xs + round(spec["swing"] * along)
        fits = to < a.shape[1]
        out[y, to[fits]] = a[src, xs[fits]]
    return Image.fromarray(out.astype(np.uint8), "RGB")


def gate_width(img: Image.Image, post_row: int, name: str) -> Image.Image:
    """An ajar gate padded on the right so its posts fill exactly GATE_POSTS of its width."""
    if not 0 <= post_row < img.height:
        sys.exit(f"{name}: its top hinge is above the gate's posts")
    solid = np.nonzero(np.asarray(img)[post_row, :, 3] > 128)[0]
    if not len(solid):
        sys.exit(f"{name}: no post at its top hinge")
    width = round((int(solid.max()) + 1) / GATE_POSTS)
    if img.width > width:
        sys.exit(f"{name}: its leaves swing wider than its posts leave room for")
    padded = Image.new("RGBA", (width, img.height))
    padded.paste(img)
    return padded


def prepare(img: Image.Image, asset: dict) -> Image.Image:
    """A sprite opened (if ajar), keyed out, cleaned, trimmed, flipped and muted, at source size."""
    if "ajar" in asset:
        img = ajar(img, asset["ajar"])
    img = keep_biggest(key_out(img))
    box = img.getbbox()
    if box is None:
        sys.exit(f"{asset['id']}: nothing left after keying out the background")
    img = img.crop(box)
    if "ajar" in asset:
        img = gate_width(img, (asset["ajar"]["hinges"][0] - box[1]) // 2, asset["id"])
    if asset.get("flip"):
        img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if asset.get("white") or not asset.get("mutant"):
        rgb, alpha = img.convert("RGB"), img.getchannel("A")
        img = ImageEnhance.Color(rgb).enhance(0 if asset.get("white") else MUTED)
        img.putalpha(alpha)
    return img


def scaled(img: Image.Image, scale: float) -> Image.Image:
    size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    return img.resize(size, Image.Resampling.LANCZOS)


def square(img: Image.Image, side: int | None = None) -> np.ndarray:
    """A generation muted and cropped square (resized to `side` if given), as floats."""
    img = ImageEnhance.Color(img.convert("RGB")).enhance(MUTED)
    crop = min(img.size)
    img = img.crop((0, 0, crop, crop))
    if side and side != crop:
        img = img.resize((side, side), Image.Resampling.LANCZOS)
    return np.asarray(img).astype(np.float32)


def recolour(a: np.ndarray, like: np.ndarray) -> np.ndarray:
    """`a` with each channel's mean and spread moved to `like`'s: one palette and lighting."""
    mean, std = a.mean(axis=(0, 1)), a.std(axis=(0, 1)) + 1e-6
    return (a - mean) / std * like.std(axis=(0, 1)) + like.mean(axis=(0, 1))


def texture(
    img: Image.Image,
    palette: Image.Image | None = None,
    edge: Image.Image | None = None,
    narrow: bool = False,
) -> Image.Image:
    """
    Tiles without seams: blended with a copy shifted half a tile, the seams faded out.
    The copy is `edge`'s when given, so every variant of it meets the others on the same
    border; `palette`'s (or `edge`'s) colours are taken on first.
    """
    a = square(img)
    side = a.shape[0]
    like = edge if edge is not None else palette
    if like is not None:
        a = recolour(a, square(like, side))
    border = square(edge, side) if edge is not None else a
    shifted = np.roll(border, (side // 2, side // 2), axis=(0, 1))
    # Weight 1 at the centre of the tile, 0 at its edges, where the seams are.
    ramp = 1 - np.abs(np.linspace(-1, 1, side))
    if narrow:
        ramp = np.minimum(1, ramp * NARROW)
    weight = np.minimum.outer(ramp, ramp)[..., None]
    out = a * weight + shifted * (1 - weight)
    tile = Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGB")
    return tile.resize((TEXTURE_PX, TEXTURE_PX), Image.Resampling.LANCZOS)


def check_wraps(tile: Image.Image, name: str) -> None:
    """Stops the build if a texture's wrap is a bigger step than any line inside it."""
    a = np.asarray(tile).astype(np.float32)
    for axis in (0, 1):
        steps = np.abs(np.diff(a, axis=axis)).mean(axis=(1, 2) if axis == 0 else (0, 2))
        inner = steps.max()
        wrap = np.abs(a.take(0, axis=axis) - a.take(-1, axis=axis)).mean()
        if wrap > inner:
            sys.exit(f"{name}: does not tile (edge step {wrap:.1f}, inside {inner:.1f})")


def check_seams(tiles: list[Image.Image], name: str) -> None:
    """Stops the build if a variant family's tiles don't meet on the same border."""
    rims = [np.asarray(t).astype(np.int16) for t in tiles]
    for r in rims[1:]:
        for rim in (np.s_[0, :], np.s_[-1, :], np.s_[:, 0], np.s_[:, -1]):
            if np.abs(r[rim] - rims[0][rim]).max() > 8:
                sys.exit(f"{name}: variants do not share their seam border")


def ajar_ok(spec: object, asset: dict) -> bool:
    """An unflipped sprite's ajar: whole-pixel hinges around the seam, swing and length."""
    if asset["kind"] != "sprite" or asset.get("flip") or not isinstance(spec, dict):
        return False
    if set(spec) != {"hinges", "seam", "swing", "length"}:
        return False
    hinges, seam = spec["hinges"], spec["seam"]
    if not (isinstance(hinges, list) and len(hinges) == 2):
        return False
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in [*hinges, seam]):
        return False
    numbers = all(isinstance(spec[k], (int, float)) for k in ("swing", "length"))
    return (
        numbers
        and 0 <= hinges[0] < seam < hinges[1]
        and 0 < spec["length"] <= 1
        and 0 <= spec["swing"] < 1
    )


def check(
    asset: dict,
    models: set[str],
    ids: set[str],
    textures: set[str],
    variants: set[str],
    styles: set[str],
) -> None:
    unknown = set(asset) - KEYS
    name = asset.get("id", "?")
    missing = REQUIRED - set(asset)
    if unknown or missing:
        sys.exit(f"{name}: unknown keys {sorted(unknown)}, missing {sorted(missing)}")
    if asset["model"] not in models:
        sys.exit(f"{name}: model {asset['model']} is not in the art-credits allow-list")
    if asset["kind"] not in ("sprite", "texture"):
        sys.exit(f"{name}: kind must be sprite or texture")
    if asset.get("style", asset["kind"]) not in styles:
        sys.exit(f"{name}: no style {asset.get('style', asset['kind'])} in the manifest")
    if "part" in asset and (asset["part"] is not True or asset["kind"] != "sprite"):
        sys.exit(f"{name}: part is true, on a sprite")
    refs = asset.get("ref", [])
    refs = [refs] if isinstance(refs, str) else refs
    if "ref" in asset and (
        not isinstance(refs, list)
        or not refs
        or not all(isinstance(r, str) for r in refs)
        or len(set(refs)) != len(refs)
        or name in refs
    ):
        sys.exit(f"{name}: ref is an asset id or a list of distinct ids, never its own")
    for ref in refs:
        if ref not in ids:
            sys.exit(f"{name}: ref {ref} is not an asset")
    photo = asset.get("photo")
    if photo is not None and (
        not isinstance(photo, str) or f"| {photo} |" not in CREDITS.read_text()
    ):
        sys.exit(f"{name}: photo {photo} is not a row of the art-credits.md table")
    for key in ("palette", "edge"):
        if key in asset and (asset["kind"] != "texture" or asset[key] not in textures):
            sys.exit(f"{name}: {key} must be a texture's, on a texture")
    if "edge" in asset and ("palette" in asset or asset["edge"] in variants):
        sys.exit(f"{name}: an edge takes its root's palette, and a root has no edge of its own")
    spec = asset.get("ajar")
    if spec is not None and not ajar_ok(spec, asset):
        sys.exit(f"{name}: ajar is hinges [top, bottom] with a seam between, swing and length")
    if not re.fullmatch(r"[a-z]+(-[a-z]+)*", name):
        sys.exit(f"{name}: ids are lower-case words joined by hyphens")


def main(only: list[str]) -> None:
    manifest = json.loads(MANIFEST.read_text())
    assets = manifest["assets"]
    ids = {a["id"] for a in assets}
    textures = {a["id"] for a in assets if a.get("kind") == "texture"}
    variants = {a["id"] for a in assets if "edge" in a}
    models = allowed_models()
    for asset in assets:
        check(asset, models, ids, textures, variants, set(manifest["style"]))
    unknown = set(only) - ids
    if unknown:
        sys.exit(f"not in the manifest: {sorted(unknown)}")
    parts = sorted({a["id"] for a in assets if a.get("part")} & set(only))
    if parts:
        print(f"parts are never written out, only used as references: {parts}")
    for jpg in [*GEN.glob("*.jpg"), *CONCEPTS.glob("*.jpg")]:
        strip_metadata(jpg)
    OUT.mkdir(parents=True, exist_ok=True)
    sources: dict[str, Image.Image] = {}
    for asset in assets:
        src_path = GEN / f"{asset['id']}.jpg"
        if not src_path.exists():
            sys.exit(f"{asset['id']}: no generation at art-src/gen/{asset['id']}.jpg")
        sources[asset["id"]] = Image.open(src_path)
    families = {a["edge"] for a in assets if "edge" in a}
    built: dict[str, Image.Image] = {}
    for asset in assets:
        if asset.get("part"):
            continue
        src = sources[asset["id"]]
        if asset["kind"] == "sprite":
            built[asset["id"]] = prepare(src, asset)
            continue
        built[asset["id"]] = texture(
            src,
            palette=sources.get(asset.get("palette", "")),
            edge=sources.get(asset.get("edge", "")),
            narrow=asset["id"] in families or "edge" in asset,
        )
        check_wraps(built[asset["id"]], asset["id"])
    for root in families:
        family = [built[a["id"]] for a in assets if a["id"] == root or a.get("edge") == root]
        check_seams(family, root)
    # A group shares one scale; any other sprite is scaled on its own.
    longest: dict[str, int] = {}
    for asset in assets:
        if asset["kind"] == "sprite" and not asset.get("part"):
            key = asset.get("group", asset["id"])
            longest[key] = max(longest.get(key, 0), *built[asset["id"]].size)
    for asset in assets:
        if (only and asset["id"] not in only) or asset.get("part"):
            continue
        img = built[asset["id"]]
        if asset["kind"] == "sprite":
            img = scaled(img, SPRITE_PX / longest[asset.get("group", asset["id"])])
        img.save(OUT / f"{asset['id']}.png", optimize=True)
        print(f"{asset['id']}: {img.width}x{img.height}")


if __name__ == "__main__":
    main(sys.argv[1:])
