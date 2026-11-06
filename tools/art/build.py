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

  id*, kind* ("sprite", "texture" or "picture"), model*, seed*, size*, prompt*,
  ref (id of the generation it edits, or a list of ids it combines: the
  first is the subject, the others what it takes on, ID-046), photo (a public
  domain photograph the generation was drawn from, credited in
  docs/art-credits.md under its id), flip (mirror left to right), upend (turn
  upside down, ID-103: the model draws a V reliably but not a ^),
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
  style means the prompt was sent as it is, with no style added), pose (ID-069: the
  generation is an edit of a coloured puppet drawn by tools/art/puppets.py and
  kept at art-src/poses/<pose>.png, which fixes the frame's pose; the puppet is the
  first image sent and any `ref` follows it, as what the figure takes on, such as a
  survivor's gun), frames (ID-069:
  the animation frame set it belongs to: a set is trimmed by one box round all
  its frames and scaled by one factor, so its frames line up by the feet; a frame
  is posed, or a repaint of a posed frame named by its single `ref`, ID-074: a
  survivor look repaints the soldier's frame, keeping its pose and grip),
  overlay (ID-103: {"part": id, "at": [x, y], "size": s, "turn": degrees}: that
  part, keyed and turned clockwise by `turn` (optional, default 0), is pasted on
  top of this sprite after it is trimmed, centred at x, y (shares of its width and
  height) with its longer side s of this sprite's longer side, so every card icon
  with a bullet shows the one approved bullet), draw (ID-103: {"shapes": [{"points":
  [[x, y], ...], "fill": "#rrggbb"}, ...], "outline": px}: a sprite with no
  generation, drawn by the build as those polygons in order on a DRAW_PX canvas,
  each filled flat with a dark outline, every shape kept however small, for a
  plain shape the model would not draw as asked; besides id, kind and draw it takes
  only overlay and group, never a generation's keys such as model or prompt).

A sprite has its magenta background keyed out to transparency, only its
biggest shape kept (detached parts under KEEP of it are dropped), and is
trimmed to its content and scaled so its longer side is SPRITE_PX; a group is
scaled so its biggest member's longer side is SPRITE_PX. A texture is made to
tile and scaled to TEXTURE_PX square; a variant family (a texture and those
with it as `edge`) shares only a narrow border, so each variant keeps most of
its own look. A picture (the world map's region, ID-028) is a whole opaque image:
PICTURE_CROP of each side is cut off (the drawn paper frame the model adds), it is
muted, darkened toward the page by PICTURE_DARKEN so the routes and risk rings drawn
over it stand out, scaled to PICTURE_PX wide and saved with a 256-colour palette.
"""

import json
import re
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "art-src" / "manifest.json"
GEN = ROOT / "art-src" / "gen"
OUT = ROOT / "src" / "assets" / "art"
CREDITS = ROOT / "docs" / "art-credits.md"

KEYS = {
    "id", "kind", "model", "seed", "size", "prompt", "ref", "flip", "mutant", "group",
    "palette", "edge", "part", "style", "photo", "white", "pose", "frames", "overlay",
    "upend", "draw",
}
POSES = ROOT / "art-src" / "poses"
# The column each puppet family stands on in its 512 px canvas (tools/art/puppets.py:
# HIP_X for the enemies, the soldier's hip for the survivors).
POSE_HIP = {"enemy": 266, "soldier": 240}
CONCEPTS = ROOT / "art-concepts"
REQUIRED = {"id", "kind", "model", "seed", "size", "prompt"}
DRAWN_REQUIRED = {"id", "kind", "draw"}
# A drawn sprite has no generation, so it takes none of a generation's keys.
DRAWN_KEYS = DRAWN_REQUIRED | {"overlay", "group"}
# A drawn sprite's canvas (its points are in these px) and how much finer it is drawn
# before being scaled down, for smooth edges.
DRAW_PX, DRAW_FINE = 512, 4
# The dark outline of the generated icons, for drawn ones.
OUTLINE = "#1a1a1a"
SPRITE_PX = 192
TEXTURE_PX = 256
PICTURE_PX = 1152
PICTURE_CROP = 0.05
PICTURE_DARKEN = 0.22
# The page background (src/page.css) a picture is darkened toward.
PAGE = (21, 23, 26)
# Ruins are muted (§15); only mutants keep their saturated colours.
MUTED = 0.7
# How magenta a pixel is: min(red, blue) - green. At or above KEY_OUT it is
# background; at or below KEY_IN it is kept; between, it is part see-through.
KEY_IN, KEY_OUT = 50, 110
# Shapes smaller than this share of the biggest one are dropped as specks.
KEEP = 0.04
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


def prepare(img: Image.Image, asset: dict) -> Image.Image:
    """A sprite keyed out, cleaned, trimmed, flipped and muted, at source size."""
    img = keep_biggest(key_out(img))
    box = img.getbbox()
    if box is None:
        sys.exit(f"{asset['id']}: nothing left after keying out the background")
    # A frame keeps its whole canvas here; its set is trimmed together (frames_trimmed).
    if "frames" not in asset:
        img = img.crop(box)
    if asset.get("flip"):
        img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if asset.get("upend"):
        img = img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    if asset.get("white") or not asset.get("mutant"):
        rgb, alpha = img.convert("RGB"), img.getchannel("A")
        img = ImageEnhance.Color(rgb).enhance(0 if asset.get("white") else MUTED)
        img.putalpha(alpha)
    return img


def check_draw(asset: dict) -> None:
    """A drawn sprite: polygons of 3+ points on the DRAW_PX canvas, each with a #rrggbb fill."""
    d = asset["draw"]
    shapes = d.get("shapes") if isinstance(d, dict) else None
    point = lambda p: (  # noqa: E731
        isinstance(p, list)
        and len(p) == 2
        and all(isinstance(v, (int, float)) and 0 <= v <= DRAW_PX for v in p)
    )
    shape = lambda s: (  # noqa: E731
        isinstance(s, dict)
        and set(s) == {"points", "fill"}
        and isinstance(s["points"], list)
        and len(s["points"]) >= 3
        and all(map(point, s["points"]))
        and isinstance(s["fill"], str)
        and re.fullmatch(r"#[0-9a-f]{6}", s["fill"]) is not None
    )
    if not (
        asset["kind"] == "sprite"
        and isinstance(d, dict)
        and set(d) == {"shapes", "outline"}
        and isinstance(shapes, list)
        and shapes
        and all(map(shape, shapes))
        and isinstance(d["outline"], (int, float))
        and 0 < d["outline"] <= DRAW_PX / 8
    ):
        sys.exit(
            f"{asset['id']}: draw is {{shapes: [{{points: [[x, y], ...] in 0..{DRAW_PX}, "
            "fill: #rrggbb}, ...], outline: px}, on a sprite"
        )


def drawn(asset: dict) -> Image.Image:
    """
    A drawn sprite (ID-103: a shape the model would not draw as asked): each polygon
    filled flat and edged with a dark outline of round joins, like the generated icons'.
    """
    d, k = asset["draw"], DRAW_FINE
    img = Image.new("RGBA", (DRAW_PX * k, DRAW_PX * k))
    pen = ImageDraw.Draw(img)
    width = round(d["outline"] * k)
    r = width / 2
    for shape in d["shapes"]:
        pts = [(x * k, y * k) for x, y in shape["points"]]
        pen.polygon(pts, fill=shape["fill"])
        pen.line([*pts, pts[0]], fill=OUTLINE, width=width, joint="curve")
        for x, y in pts:
            pen.ellipse((x - r, y - r, x + r, y + r), fill=OUTLINE)
    img = img.resize((DRAW_PX, DRAW_PX), Image.Resampling.LANCZOS)
    return img.crop(img.getbbox())


def overlaid(
    img: Image.Image, part: Image.Image, at: list[float], size: float, turn: float = 0
) -> Image.Image:
    """`part` pasted over trimmed sprite `img` (see `overlay`), the canvas grown if it pokes out."""
    if turn:
        part = part.rotate(-turn, Image.Resampling.BICUBIC, expand=True)
        part = part.crop(part.getbbox())
    part = scaled(part, size * max(img.size) / max(part.size))
    x = round(at[0] * img.width - part.width / 2)
    y = round(at[1] * img.height - part.height / 2)
    left, top = max(0, -x), max(0, -y)
    w = max(img.width, x + part.width) + left
    h = max(img.height, y + part.height) + top
    out = Image.new("RGBA", (w, h))
    out.alpha_composite(img, (left, top))
    out.alpha_composite(part, (x + left, y + top))
    return out


def frames_trimmed(
    frames: list[Image.Image], name: str, hip: int
) -> tuple[list[Image.Image], int]:
    """
    A frame set trimmed by one box round all its frames, so they keep their places, and
    widened with clear margin to sit evenly about column `hip` (where its puppets stand),
    so the body, not its reach, is over the sprite's middle: the renderer stands a sprite
    on its middle. Also the longer side of the box before it was widened, which sets the
    set's scale, so a long reach (a raised gun) never shrinks the body.
    """
    if len({f.size for f in frames}) != 1:
        sys.exit(f"{name}: a frame set's generations must all be the same size")
    boxes = [f.getbbox() for f in frames]
    x0, x1 = min(b[0] for b in boxes), max(b[2] for b in boxes)
    y0, y1 = min(b[1] for b in boxes), max(b[3] for b in boxes)
    half = max(hip - x0, x1 - hip)
    return [f.crop((hip - half, y0, hip + half, y1)) for f in frames], max(x1 - x0, y1 - y0)


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


def picture(img: Image.Image) -> Image.Image:
    """The frame cut off, muted, darkened toward the page and scaled to PICTURE_PX wide."""
    img = img.convert("RGB")
    dx, dy = round(img.width * PICTURE_CROP), round(img.height * PICTURE_CROP)
    img = img.crop((dx, dy, img.width - dx, img.height - dy))
    img = ImageEnhance.Color(img).enhance(MUTED)
    img = Image.blend(img, Image.new("RGB", img.size, PAGE), PICTURE_DARKEN)
    img = img.resize(
        (PICTURE_PX, round(img.height * PICTURE_PX / img.width)), Image.Resampling.LANCZOS
    )
    # A 256-colour palette, dithered: under half the size of full colour, and the
    # game doesn't wait for it at start (src/ui/sprites.ts LAZY_ART).
    return img.quantize(256, Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)


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


def check(
    asset: dict,
    models: set[str],
    ids: set[str],
    textures: set[str],
    variants: set[str],
    styles: set[str],
    posed: set[str],
    parts: set[str] = frozenset(),
) -> None:
    unknown = set(asset) - KEYS
    name = asset.get("id", "?")
    is_drawn = "draw" in asset
    missing = (DRAWN_REQUIRED if is_drawn else REQUIRED) - set(asset)
    if is_drawn:
        unknown |= set(asset) - DRAWN_KEYS
    if unknown or missing:
        sys.exit(f"{name}: unknown keys {sorted(unknown)}, missing {sorted(missing)}")
    if is_drawn:
        check_draw(asset)
    elif asset["model"] not in models:
        sys.exit(f"{name}: model {asset['model']} is not in the art-credits allow-list")
    if asset["kind"] not in ("sprite", "texture", "picture"):
        sys.exit(f"{name}: kind must be sprite, texture or picture")
    if not is_drawn and asset.get("style", asset["kind"]) not in styles:
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
    if not re.fullmatch(r"[a-z]+(-[a-z]+)*", name):
        sys.exit(f"{name}: ids are lower-case words joined by hyphens")
    pose = asset.get("pose")
    if pose is not None and (
        asset["kind"] != "sprite"
        or not isinstance(pose, str)
        or not re.fullmatch(r"[a-z]+-[a-z0-9]+", pose)
        or not (POSES / f"{pose}.png").is_file()
    ):
        sys.exit(f"{name}: pose is a puppet at art-src/poses/<pose>.png, on a sprite")
    frames = asset.get("frames")
    if frames is not None and (
        asset["kind"] != "sprite"
        or not isinstance(frames, str)
        or not re.fullmatch(r"[a-z]+(-[a-z]+)*", frames)
        or "group" in asset
        or asset.get("part")
        or (pose is None and not (isinstance(asset.get("ref"), str) and asset["ref"] in posed))
    ):
        sys.exit(
            f"{name}: frames names a set, on a posed sprite (or a repaint of one) "
            "with no group or part"
        )
    if "upend" in asset and (asset["upend"] is not True or asset["kind"] != "sprite"):
        sys.exit(f"{name}: upend is true, on a sprite")
    over = asset.get("overlay")
    if over is not None:
        at = over.get("at") if isinstance(over, dict) else None
        size = over.get("size") if isinstance(over, dict) else None
        turn = over.get("turn", 0) if isinstance(over, dict) else None
        if not (
            asset["kind"] == "sprite"
            and not asset.get("part")
            and "frames" not in asset
            and {"part", "at", "size"} <= set(over) <= {"part", "at", "size", "turn"}
            and isinstance(turn, (int, float))
            and -360 <= turn <= 360
            and over["part"] in parts
            and isinstance(at, list)
            and len(at) == 2
            and all(isinstance(v, (int, float)) and 0 <= v <= 1 for v in at)
            and isinstance(size, (int, float))
            and 0 < size <= 1
        ):
            sys.exit(
                f"{name}: overlay is {{part, at: [x, y] in 0..1, size in (0, 1], turn?}}, "
                "naming a part, on a sprite that is not a part or a frame"
            )


def main(only: list[str]) -> None:
    manifest = json.loads(MANIFEST.read_text())
    assets = manifest["assets"]
    ids = {a["id"] for a in assets}
    textures = {a["id"] for a in assets if a.get("kind") == "texture"}
    variants = {a["id"] for a in assets if "edge" in a}
    posed = {a["id"] for a in assets if "pose" in a}
    parts_all = {a["id"] for a in assets if a.get("part") and a.get("kind") == "sprite"}
    models = allowed_models()
    for asset in assets:
        check(asset, models, ids, textures, variants, set(manifest["style"]), posed, parts_all)
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
        if "draw" in asset:
            continue
        src_path = GEN / f"{asset['id']}.jpg"
        if not src_path.exists():
            sys.exit(f"{asset['id']}: no generation at art-src/gen/{asset['id']}.jpg")
        sources[asset["id"]] = Image.open(src_path)
    families = {a["edge"] for a in assets if "edge" in a}
    by_id = {a["id"]: a for a in assets}
    built: dict[str, Image.Image] = {}
    for asset in assets:
        if asset.get("part"):
            continue
        src = sources.get(asset["id"])
        if asset["kind"] == "sprite":
            built[asset["id"]] = drawn(asset) if "draw" in asset else prepare(src, asset)
            over = asset.get("overlay")
            if over:
                part = prepare(sources[over["part"]], by_id[over["part"]])
                built[asset["id"]] = overlaid(
                    built[asset["id"]], part, over["at"], over["size"], over.get("turn", 0)
                )
            continue
        if asset["kind"] == "picture":
            built[asset["id"]] = picture(src)
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
    sets: dict[str, list[str]] = {}
    for asset in assets:
        if "frames" in asset:
            sets.setdefault(asset["frames"], []).append(asset["id"])
    set_longest: dict[str, int] = {}
    for name, members in sets.items():
        poses = {by_id[i].get("pose", "").split("-")[0] for i in members}
        hip = POSE_HIP.get(poses.pop(), POSE_HIP["enemy"]) if len(poses) == 1 else None
        if hip is None:
            sys.exit(f"{name}: a frame set's frames are posed from one puppet family")
        trimmed, set_longest[name] = frames_trimmed([built[i] for i in members], name, hip)
        for i, img in zip(members, trimmed):
            built[i] = img
    # A group or a frame set shares one scale; any other sprite is scaled on its own.
    scale_key = lambda a: a.get("frames", a.get("group", a["id"]))  # noqa: E731
    longest: dict[str, int] = dict(set_longest)
    for asset in assets:
        if asset["kind"] == "sprite" and not asset.get("part") and "frames" not in asset:
            key = scale_key(asset)
            longest[key] = max(longest.get(key, 0), *built[asset["id"]].size)
    for asset in assets:
        if (only and asset["id"] not in only) or asset.get("part"):
            continue
        img = built[asset["id"]]
        if asset["kind"] == "sprite":
            img = scaled(img, SPRITE_PX / longest[scale_key(asset)])
        img.save(OUT / f"{asset['id']}.png", optimize=True)
        print(f"{asset['id']}: {img.width}x{img.height}")


if __name__ == "__main__":
    main(sys.argv[1:])
