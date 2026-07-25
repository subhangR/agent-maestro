#!/usr/bin/env python3
"""
Process real product screenshots into the website's light + dark tour assets.

Usage:
    python3 scripts/process-shots.py [SOURCE_DIR]

Drop your real app captures into SOURCE_DIR (default: ~/Downloads/maestro-shots),
named after the tour views you want to replace:

    home  feed  tasks  graph  team  docs  tracking  leaderboard
    feed-panel  task-detail

Any of .png/.jpg/.jpeg works. For each file the script writes an optimized
light JPG and a smart-inverted dark JPG into website/assets/shots/, which the
site already swaps by theme. Only the names you provide are replaced; the rest
keep their current assets. `home` is also the hero shot.
"""
import os, sys, glob
from PIL import Image, ImageOps

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(REPO, "website", "assets", "shots")
CORE = ["home", "feed", "tasks", "graph", "team", "docs"]
KNOWN = CORE + ["tracking", "leaderboard", "feed-panel", "task-detail"]
MAXW = 1600

def darkify(im):
    """Simulate a dark UI: invert lightness, preserve hue."""
    rgb = im.convert("RGB")
    h, s, v = ImageOps.invert(rgb).convert("HSV").split()
    h = h.point(lambda x: (x + 128) % 256)
    s = s.point(lambda x: int(x * 0.82))
    return ImageOps.autocontrast(Image.merge("HSV", (h, s, v)).convert("RGB"), cutoff=0)

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Downloads/maestro-shots")
    if not os.path.isdir(src):
        print("Source dir not found: %s\nPut your screenshots there (named home.png, feed.png, ...)." % src)
        sys.exit(1)
    os.makedirs(DEST, exist_ok=True)
    files = []
    for ext in ("png", "jpg", "jpeg", "PNG", "JPG"):
        files += glob.glob(os.path.join(src, "*." + ext))
    if not files:
        print("No images found in %s" % src); sys.exit(1)

    done = []
    for path in sorted(files):
        name = os.path.splitext(os.path.basename(path))[0].lower().strip()
        im = Image.open(path).convert("RGB")
        if im.width > MAXW:
            im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
        im.save(os.path.join(DEST, name + ".jpg"), "JPEG", quality=84, optimize=True, progressive=True)
        darkify(im).save(os.path.join(DEST, name + "-dark.jpg"), "JPEG", quality=84, optimize=True, progressive=True)
        done.append(name)
        note = "" if name in KNOWN else "  (note: not a standard tour name — wire it into index.html to show it)"
        print("  %-14s -> %s.jpg + %s-dark.jpg%s" % (name, name, name, note))

    missing = [n for n in CORE if n not in done]
    print("\nProcessed %d screenshot(s)." % len(done))
    if missing:
        print("Tour views still using the old assets: " + ", ".join(missing))
    print("Next: preview locally, then commit + deploy (see docs/website/PIPELINE.md).")

if __name__ == "__main__":
    main()
