"""Cuts the gun shot clips in src/assets/sounds from The Free Firearm Sound Library (CC0).

Usage: python3 -I tools/audio/cut.py <unpacked "Prepared SFX Library" folder> src/assets/sounds
Needs ffmpeg with libmp3lame (made with ffmpeg 8.1.2; another version may encode
slightly different bytes). See docs/audio-credits.md for the source and its licence.

For each clip: the library file (found by its unique name) is mixed to mono, cut from
10 ms before the first sample above 30 % of the file's peak for `length` s (no second
shot may start inside), faded out over the last 40 %, its own loudest sample set to
-1 dBFS, and encoded bit-exact as a 96 kbps mono MP3 with no ID3 or APE tags.
"""
import array
import os
import subprocess
import sys

RATE = 48000
MONO = "pan=mono|c0=0.5*c0+0.5*c1"
# The game's cue: the library file, and seconds kept.
PICKS = {
    "pistol": ("X_39P.wav", 0.7),  # 9 mm semi-automatic pistol, near
    "smg": ("G_31P.wav", 0.5),  # 9 mm sub-machine gun, single shot, near
    "rifle": ("D_32P.wav", 0.9),  # 5.56 mm semi-automatic carbine, near
    "shotgun": ("O_21P.wav", 1.1),  # 12 gauge pump-action shotgun, near
    "lmg": ("C_28P.wav", 0.6),  # 7.62x39 mm automatic rifle, single shot, near
    "sniper": ("M_21P.wav", 1.5),  # 7.62x54 mm bolt-action rifle, near
    "turret": ("R_35P.wav", 0.4),  # .22 semi-automatic pistol, near
}
BITEXACT = ["-fflags", "+bitexact", "-flags:a", "+bitexact"]


def find(lib, name):
    for folder, _, files in os.walk(lib):
        if name in files:
            return os.path.join(folder, name)
    raise FileNotFoundError(name)


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-af", MONO, "-ar", str(RATE), "-f", "f32le", "-"],
        check=True,
        capture_output=True,
    ).stdout
    a = array.array("f")
    a.frombytes(raw)
    return a


def onsets(a, threshold, gap):
    """Where the level first rises over `threshold` after `gap` s below it."""
    found, last = [], -(10**9)
    for i, v in enumerate(a):
        if abs(v) >= threshold:
            if i - last > gap * RATE:
                found.append(i)
            last = i
    return found


def cut(lib, out, cue, name, length):
    path = find(lib, name)
    a = decode(path)
    hits = onsets(a, max(abs(v) for v in a) * 0.3, 0.15)
    start = max(0, hits[0] - int(0.01 * RATE))
    end = start + int(length * RATE)
    if any(h < end for h in hits[1:]):
        raise SystemExit(f"{name}: a second shot starts inside the clip")
    peak = max(abs(v) for v in a[start:end])
    fade_at = length * 0.6
    subprocess.run(
        [
            "ffmpeg", "-v", "error", "-y", *BITEXACT, "-i", path,
            "-af",
            f"{MONO},aresample={RATE},atrim=start={start / RATE}:duration={length},"
            f"asetpts=PTS-STARTPTS,afade=t=out:st={fade_at}:d={length - fade_at},"
            f"volume={0.89 / peak}",
            "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "96k",
            "-map_metadata", "-1", "-id3v2_version", "0", *BITEXACT,
            os.path.join(out, f"shot-{cue}.mp3"),
        ],
        check=True,
    )
    print(f"shot-{cue}.mp3 from {name}")


def main(argv):
    if len(argv) != 3:
        raise SystemExit(__doc__)
    lib, out = argv[1], argv[2]
    os.makedirs(out, exist_ok=True)
    for cue, (name, length) in PICKS.items():
        cut(lib, out, cue, name, length)


if __name__ == "__main__":
    main(sys.argv)
