"""Coloured puppet poses (ID-069): the pose references animation frames are painted over.

Each frame of an enemy's walk or attack is a FLUX.2 Klein edit of one of these puppets
(manifest `pose`), so the pose is fixed by the drawing, not left to the prompt. Side-on,
facing left, in the kind's colours, on magenta.

Angles in degrees from straight down; positive swings a limb forward (left).
Each pose: leg_n/leg_f (thigh, shin), arm_n/arm_f (upper arm, forearm), lean (torso, deg forward).
The figure is dropped so its lowest ankle or hand stands on GROUND, its hip on HIP_X,
so frames of a set line up by the feet.
  python3 tools/art/puppets.py          # draw every kind into art-src/poses/
  python3 tools/art/puppets.py <kind>   # draw one kind (`soldier` for the survivors)
"""
import math
import sys
from PIL import Image, ImageDraw

EDGE, BG = (25, 25, 25), (255, 0, 255)
GROUND, HIP_X = 472, 266


def seg(p, ang, length):
    a = math.radians(ang)
    return (p[0] - length * math.sin(a), p[1] + length * math.cos(a))


SHAMBLE = {  # arms reach forward in every frame, so the passing frame never drops them
    'w1': dict(leg_n=(30, -5), leg_f=(-25, -40), arm_n=(70, 80), arm_f=(80, 90), lean=16),
    'w2': dict(leg_n=(2, 0), leg_f=(-8, -45), arm_n=(75, 85), arm_f=(75, 85), lean=16),
    'w3': dict(leg_n=(-25, -40), leg_f=(30, -5), arm_n=(80, 90), arm_f=(70, 80), lean=16),
    'at': dict(leg_n=(38, 10), leg_f=(-32, -30), arm_n=(100, 95), arm_f=(92, 88), lean=42),
}
RUN = {
    'w1': dict(leg_n=(55, 0), leg_f=(-35, -95), arm_n=(-45, 30), arm_f=(60, 110), lean=28),
    'w2': dict(leg_n=(10, -5), leg_f=(20, -110), arm_n=(10, 80), arm_f=(10, 80), lean=28),
    'w3': dict(leg_n=(-35, -95), leg_f=(55, 0), arm_n=(60, 110), arm_f=(-45, 30), lean=28),
    'at': dict(leg_n=(35, 10), leg_f=(-30, -40), arm_n=(110, 120), arm_f=(95, 105), lean=35),
}
STOMP = {  # heavy wide stride, fists swinging low
    'w1': dict(leg_n=(38, -5), leg_f=(-32, -45), arm_n=(-15, 10), arm_f=(35, 50), lean=14),
    'w2': dict(leg_n=(4, 0), leg_f=(-6, -70), arm_n=(12, 25), arm_f=(10, 25), lean=14),
    'w3': dict(leg_n=(-32, -45), leg_f=(38, -5), arm_n=(35, 50), arm_f=(-15, 10), lean=14),
    'at': dict(leg_n=(42, 5), leg_f=(-34, -30), arm_n=(98, 92), arm_f=(80, 70), lean=36),
}
WADDLE = {  # short legs swinging wide round the belly, arms out a little
    'w1': dict(leg_n=(42, -5), leg_f=(-36, -35), arm_n=(35, 50), arm_f=(15, 30), lean=6),
    'w2': dict(leg_n=(4, 0), leg_f=(-6, -60), arm_n=(28, 42), arm_f=(28, 42), lean=0),
    'w3': dict(leg_n=(-36, -35), leg_f=(42, -5), arm_n=(15, 30), arm_f=(35, 50), lean=6),
    'at': dict(leg_n=(28, 5), leg_f=(-25, -20), arm_n=(80, 70), arm_f=(75, 65), lean=22),
}
HUNCH = {  # bent knees, torso pitched forward, arms hanging
    'w1': dict(leg_n=(40, -10), leg_f=(-20, -50), arm_n=(15, 25), arm_f=(35, 45), lean=40),
    'w2': dict(leg_n=(15, -15), leg_f=(5, -60), arm_n=(25, 35), arm_f=(25, 35), lean=40),
    'w3': dict(leg_n=(-20, -50), leg_f=(40, -10), arm_n=(35, 45), arm_f=(15, 25), lean=40),
    'at': dict(leg_n=(40, 0), leg_f=(-25, -40), arm_n=(60, 70), arm_f=(55, 65), lean=55),
}
SPREAD = {  # thin walker, clawed arms flung wide (side-on: one up and forward, one back)
    'w1': dict(leg_n=(45, -5), leg_f=(-35, -55), arm_n=(120, 150), arm_f=(-110, -140), lean=4),
    'w2': dict(leg_n=(2, 0), leg_f=(-10, -90), arm_n=(125, 155), arm_f=(-115, -145), lean=4),
    'w3': dict(leg_n=(-35, -55), leg_f=(45, -5), arm_n=(120, 150), arm_f=(-110, -140), lean=4),
    'at': dict(leg_n=(32, 5), leg_f=(-28, -35), arm_n=(95, 100), arm_f=(85, 95), lean=-8),
}
DRAG = {  # colossal: slow stride, long arms swinging near the ground
    'w1': dict(leg_n=(20, -5), leg_f=(-16, -28), arm_n=(-10, 5), arm_f=(25, 35), lean=24),
    'w2': dict(leg_n=(2, 0), leg_f=(-4, -32), arm_n=(8, 18), arm_f=(8, 18), lean=24),
    'w3': dict(leg_n=(-16, -28), leg_f=(20, -5), arm_n=(25, 35), arm_f=(-10, 5), lean=24),
    'at': dict(leg_n=(24, 5), leg_f=(-20, -28), arm_n=(155, 125), arm_f=(145, 115), lean=30),
}
# On all fours: the torso almost level, arms are front legs, legs fold back behind.
CRAWL = {
    'w1': dict(leg_n=(-20, 15), leg_f=(-50, -10), arm_n=(25, -5), arm_f=(-10, -15), lean=78),
    'w2': dict(leg_n=(-35, 5), leg_f=(-35, 5), arm_n=(8, -10), arm_f=(8, -10), lean=78),
    'w3': dict(leg_n=(-50, -10), leg_f=(-20, 15), arm_n=(-10, -15), arm_f=(25, -5), lean=78),
    'at': dict(leg_n=(-25, 10), leg_f=(-45, 0), arm_n=(70, 60), arm_f=(55, 50), lean=55),
}

KINDS = {
    'shambler': dict(poses=SHAMBLE, skin=(150, 185, 95), cloth=(150, 150, 155), torso=72,
                     limb=1.35, head=1.3, depth=(16, -10)),
    'runner': dict(poses=RUN, skin=(175, 165, 150), cloth=(135, 135, 140), torso=56, limb=1.1,
                   head=1.15, depth=(14, -8)),
    'brute': dict(bare=True, poses=STOMP, skin=(185, 75, 65), cloth=(95, 80, 70), torso=92, limb=1.7,
                  head=1.05, depth=(22, -12), armour=(120, 120, 125)),
    'swollen': dict(poses=WADDLE, skin=(150, 190, 80), cloth=(110, 105, 95), torso=70, limb=1.3,
                    head=0.85, depth=(14, -8), belly=118, legs=0.8),
    'spewer': dict(bare=True, poses=HUNCH, skin=(140, 185, 75), cloth=(105, 100, 90), torso=58, limb=1.05,
                   head=1.05, depth=(12, -8), sac=(70, 60), sleeves=False),
    'screamer': dict(bare=True, poses=SPREAD, skin=(185, 80, 70), cloth=(100, 85, 75), torso=50, limb=1.0,
                     head=1.15, depth=(12, -8), spikes=True, sleeves=False, tilt=18),
    'horror': dict(bare=True, poses=DRAG, skin=(180, 70, 60), cloth=(95, 80, 70), torso=120, limb=1.9,
                   head=0.85, depth=(24, -14), growths=True, arms=1.6, sleeves=False),
    'crawler': dict(bare=True, poses=CRAWL, skin=(120, 190, 70), cloth=(95, 110, 75), torso=58, limb=1.15,
                    head=1.0, depth=(10, -10), sleeves=False),
}


def shade(c, k):
    return tuple(int(v * k) for v in c)


def draw(kind, pose):
    k = KINDS[kind]
    lw = k.get('limb', 1.0)
    THIGH = SHIN = 78 * k.get('legs', 1.0)
    UARM, FARM = 62 * k.get('arms', 1.0), 58 * k.get('arms', 1.0)
    TORSO = 120
    skin_n, skin_f = k['skin'], shade(k['skin'], 0.72)
    cloth_n, cloth_f = k['cloth'], shade(k['cloth'], 0.72)
    ops, contacts = [], []  # figure space, hip at (0, 0)

    def line(a, b, col, w):
        ops.append(('line', a, b, col, w))

    def ell(cx, cy, rx, ry, col):
        ops.append(('ell', (cx - rx, cy - ry, cx + rx, cy + ry), col))

    hip = (0.0, 0.0)
    lean = math.radians(pose['lean'])
    neck = (-TORSO * math.sin(lean), -TORSO * math.cos(lean))
    sh = (neck[0] + 4, neck[1] + 12)
    dx, dy = k.get('depth', (0, 0))
    hip_f, sh_f = (dx, dy), (sh[0] + dx, sh[1] + dy)

    def leg(a, cloth, skin, h):
        kn = seg(h, a[0], THIGH)
        ft = seg(kn, a[1], SHIN)
        contacts.append((ft[0], ft[1] - h[1]))  # a foot's reach below its own hip
        line(h, kn, cloth, 30 * lw)
        line(kn, ft, cloth, 26 * lw)
        line(ft, (ft[0] - 24 * lw, ft[1] + 2), skin, 14 * lw)

    def arm(a, cloth, skin, s):
        el = seg(s, a[0], UARM)
        hd = seg(el, a[1], FARM)
        contacts.append(hd)
        line(s, el, cloth if k.get('sleeves', True) else skin, 22 * lw)
        line(el, hd, skin, 16 * lw)
        r = 11 * lw
        ell(hd[0], hd[1], r, r, skin)

    arm(pose['arm_f'], cloth_f, skin_f, sh_f)
    leg(pose['leg_f'], cloth_f, skin_f, hip_f)
    mid = ((hip[0] + neck[0]) / 2, (hip[1] + neck[1]) / 2)
    if 'sac' in k:  # a fleshy sac on the upper back
        rx, ry = k['sac']
        ell(mid[0] + 40, mid[1] - 30, rx, ry, shade(skin_n, 1.08))
    if k.get('growths'):  # tumours over the hunched back
        for t, r in ((0.45, 46), (0.7, 40), (0.9, 30)):
            ell(neck[0] * t + 40, neck[1] * t - 20, r, r, shade(skin_n, 1.1))
    line(hip, neck, skin_n if ('belly' in k or k.get('bare')) else cloth_n, k['torso'])
    if 'belly' in k:
        r = k['belly']
        ell(mid[0] - 18, mid[1] + 6, r, r * 0.92, skin_n)
    if 'armour' in k:  # plates over chest and shoulder
        a = k['armour']
        cx, cy = mid[0] - 30, mid[1] - 10
        ops.append(('poly', [(cx - 34, cy - 34), (cx + 24, cy - 44), (cx + 28, cy + 24),
                             (cx - 28, cy + 30)], a))
        ell(sh[0] - 2, sh[1] - 2, 38, 28, a)
    hr = k.get('head', 1.0)
    hx, hy = neck[0] - 20 + k.get('tilt', 0), neck[1] - 30 * hr
    ell(hx, hy, 28 * hr, 32 * hr, skin_n)
    if k.get('spikes'):
        for ang in (-40, 0, 40, 80):
            a = math.radians(ang)
            base = (hx + 26 * hr * math.sin(a), hy - 30 * hr * math.cos(a))
            line(base, (base[0] + 26 * math.sin(a), base[1] - 26 * math.cos(a)), (230, 220, 200), 9)
    leg(pose['leg_n'], cloth_n, skin_n, hip)
    arm(pose['arm_n'], cloth_n, skin_n, sh)

    ox, oy = HIP_X, GROUND - max(p[1] for p in contacts)
    im = Image.new('RGB', (512, 512), BG)
    d = ImageDraw.Draw(im)
    t = lambda p: (p[0] + ox, p[1] + oy)
    for op in ops:
        if op[0] == 'line':
            a, b, col, w = t(op[1]), t(op[2]), op[3], op[4]
            d.line([a, b], fill=EDGE, width=int(w + 6))
            d.line([a, b], fill=col, width=int(w))
            for q in (a, b):
                d.ellipse([q[0] - w / 2, q[1] - w / 2, q[0] + w / 2, q[1] + w / 2], fill=col)
        elif op[0] == 'ell':
            x0, y0, x1, y1 = op[1]
            d.ellipse([x0 + ox, y0 + oy, x1 + ox, y1 + oy], fill=op[2], outline=EDGE, width=3)
        else:
            d.polygon([t(p) for p in op[1]], fill=op[2], outline=EDGE)
    return im


# Survivors (ID-069): a soldier facing right with a gun, idle (held low, pointing down) or
# aiming (raised, level); a pistol is a short gun in the near hand. The generation paints the
# soldier and, from a second reference (manifest `ref`), the gun in place of the dark bar.
S_SKIN, S_JACKET, S_TROUSER, S_HELMET, S_GUN = (
    (205, 160, 125), (120, 115, 80), (60, 65, 75), (85, 95, 60), (30, 30, 32))
SOLDIER = {
    'idle': dict(gun=(70, 215), gun_len=150, hand_r=(20, 70), hand_l=(35, 60)),
    'aim': dict(gun=(0, 172), gun_len=165, hand_r=(70, 95), hand_l=(85, 100)),
    'pidle': dict(gun=None, gun_len=40, hand_r=(10, 25), hand_l=(-5, 10), gun_ang=45),
    'paim': dict(gun=None, gun_len=40, hand_r=(88, 92), hand_l=(84, 90), gun_ang=0),
}


def draw_soldier(name):
    """Angles here swing toward +x (right, the way the soldier faces)."""
    p = SOLDIER[name]
    fwd = lambda q, ang, length: seg(q, -ang, length)  # noqa: E731
    im = Image.new('RGB', (512, 512), BG)
    d = ImageDraw.Draw(im)

    def bone(a, b, c, w):
        d.line([a, b], fill=EDGE, width=int(w + 6))
        d.line([a, b], fill=c, width=int(w))
        for q in (a, b):
            d.ellipse([q[0] - w / 2, q[1] - w / 2, q[0] + w / 2, q[1] + w / 2], fill=c)

    hip, neck, sh = (240, 300), (246, 180), (250, 196)
    for leg, k in (((-12, 4), 0.72), ((14, -2), 1.0)):  # far leg back, near leg forward
        kn = fwd(hip, leg[0], 85)
        ft = fwd(kn, leg[1], 85)
        c = shade(S_TROUSER, k)
        bone(hip, kn, c, 34)
        bone(kn, ft, c, 30)
        bone(ft, (ft[0] + 26, ft[1] + 2), EDGE, 18)
    el = fwd(sh, p['hand_l'][0], 58)
    hd = fwd(el, p['hand_l'][1], 54)
    bone(sh, el, shade(S_JACKET, 0.72), 24)
    bone(el, hd, shade(S_SKIN, 0.8), 16)
    bone(hip, neck, S_JACKET, 70)
    d.ellipse([neck[0] - 30, neck[1] - 64, neck[0] + 34, neck[1] - 4], fill=S_SKIN, outline=EDGE, width=3)
    d.chord([neck[0] - 36, neck[1] - 76, neck[0] + 40, neck[1] - 14], 180, 360, fill=S_HELMET,
            outline=EDGE, width=3)
    if p['gun'] is not None:  # from its butt, `gun[1]` degrees round from pointing left
        butt = (sh[0] - 10 + p['gun'][0] * 0.4, sh[1] + 10 + p['gun'][0])
        ang = math.radians(p['gun'][1] - 180)
        bone(butt, (butt[0] + p['gun_len'] * math.cos(ang), butt[1] + p['gun_len'] * math.sin(ang)),
             S_GUN, 16)
    el = fwd(sh, p['hand_r'][0], 58)
    hd = fwd(el, p['hand_r'][1], 54)
    bone(sh, el, S_JACKET, 24)
    bone(el, hd, S_SKIN, 16)
    if p['gun'] is None:  # the pistol in the near hand
        a = math.radians(p['gun_ang'])
        bone(hd, (hd[0] + p['gun_len'] * math.cos(a), hd[1] + p['gun_len'] * math.sin(a)), S_GUN, 14)
        bone(hd, (hd[0] + 4, hd[1] + 18), S_GUN, 12)
    return im


if __name__ == '__main__':
    from pathlib import Path
    out = Path(__file__).resolve().parents[2] / 'art-src' / 'poses'
    out.mkdir(exist_ok=True)
    for kind in sys.argv[1:] or [*KINDS, 'soldier']:
        if kind == 'soldier':
            for name in SOLDIER:
                draw_soldier(name).save(out / f'soldier-{name}.png', optimize=True)
            continue
        for name, pose in KINDS[kind]['poses'].items():
            draw(kind, pose).save(out / f'{kind}-{name}.png', optimize=True)
