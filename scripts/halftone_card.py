"""Convert a project picture into the portfolio's halftone card style.

Matches the reference cards (IP camera, NPI, Orbis, Peers, House of Articles,
water tank): monochrome line art plus a 6 px square dot screen on warm paper.

    python scripts/halftone_card.py assets/projects/foo.png            # UI screenshot in a drawn window frame
    python scripts/halftone_card.py assets/projects/bar.png --unframed # illustration / render, full bleed

Writes assets/projects/<stem>-halftone.jpg (1100x628). SVGs must be rasterised
to PNG first (e.g. a browser screenshot at the viewBox size).
Point the card at the new file through the `image` field in apps.json.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

OUTPUT_SIZE = (1100, 628)
CELL = 6
DOT = 3
SUPERSAMPLE = 2
PAPER = np.array([243, 242, 238], dtype=np.float32)
WINDOW_FILL = np.array([248, 247, 244], dtype=np.float32)
DOT_INK = np.array([96, 96, 94], dtype=np.float32)
LINE_INK = np.array([40, 40, 40], dtype=np.float32)
BAYER_4 = np.array(
    [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float32
) / 16 + 1 / 32


def to_image(mask_or_gray):
    return Image.fromarray((np.clip(mask_or_gray, 0, 1) * 255).astype(np.uint8))


def edges(gray, threshold):
    blurred = np.asarray(to_image(gray).filter(ImageFilter.GaussianBlur(0.9)), dtype=np.float32) / 255
    gx = np.zeros_like(blurred)
    gy = np.zeros_like(blurred)
    gx[:, 1:-1] = blurred[:, 2:] - blurred[:, :-2]
    gy[1:-1, :] = blurred[2:, :] - blurred[:-2, :]
    return np.hypot(gx, gy) > threshold


def line_mask(gray, threshold, strokes):
    if not strokes:
        return edges(gray, threshold)
    # UI screenshots: keep thin dark strokes (text, rules) solid, outline the rest;
    # large dark panels are left to the dot screen instead of turning black.
    dark = gray < 0.42
    large = to_image(dark).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))
    thin = dark & ~(np.asarray(large) > 127)
    return edges(gray, threshold * 1.6) | thin


def dot_screen(darkness, height, width):
    rows, cols = height // CELL, width // CELL
    cells = darkness[: rows * CELL, : cols * CELL].reshape(rows, CELL, cols, CELL).mean(axis=(1, 3))
    thresholds = np.tile(BAYER_4, (rows // 4 + 1, cols // 4 + 1))[:rows, :cols]
    dot_on = cells > thresholds * 0.9 + 0.06
    cell = np.zeros((CELL, CELL), dtype=bool)
    cell[:DOT, :DOT] = True
    mask = np.zeros((height, width), dtype=bool)
    mask[: rows * CELL, : cols * CELL] = np.kron(dot_on, cell).astype(bool)
    return mask


def halftone(source_path, framed=True, invert=None, line_threshold=None):
    width, height = OUTPUT_SIZE
    if line_threshold is None:
        line_threshold = 0.14 if framed else 0.12
    source = Image.open(source_path).convert("RGB")
    gray_full = np.asarray(source.convert("L"), dtype=np.float32) / 255
    border = np.concatenate(
        [gray_full[:10].ravel(), gray_full[-10:].ravel(), gray_full[:, :10].ravel(), gray_full[:, -10:].ravel()]
    )
    if invert is None:
        invert = np.median(border) < 0.5  # dark UI -> light paper
    if framed:
        box_w = int(width * 0.84) // CELL * CELL
        box_h = min(int(box_w * 0.5625), int(height * 0.80)) // CELL * CELL
        box_x = (width - box_w) // 2 // CELL * CELL
        box_y = (height - box_h) // 2 // CELL * CELL + 6
        chrome = 24
    else:
        box_w, box_h, box_x, box_y, chrome = width, height, 0, 0, 0
    content_w, content_h = box_w, box_h - chrome

    big = ImageOps.fit(source, (content_w * SUPERSAMPLE, content_h * SUPERSAMPLE), method=Image.LANCZOS)
    gray_big = np.asarray(big.convert("L"), dtype=np.float32) / 255
    if invert:
        gray_big = 1 - gray_big
    low, high = np.percentile(gray_big, 2), np.percentile(gray_big, 98)
    gray_big = np.clip((gray_big - low) / max(high - low, 1e-3), 0, 1)
    lines = line_mask(gray_big, line_threshold, strokes=framed)
    line_alpha = np.asarray(to_image(lines).resize((content_w, content_h), Image.BOX), dtype=np.float32) / 255
    line_alpha = np.clip(line_alpha * 1.8, 0, 1)
    gray = np.asarray(to_image(gray_big).resize((content_w, content_h), Image.BOX), dtype=np.float32) / 255

    darkness = np.zeros((height, width), dtype=np.float32)
    alpha = np.zeros((height, width), dtype=np.float32)
    top = box_y + chrome
    darkness[top: top + content_h, box_x: box_x + content_w] = 1 - gray
    alpha[top: top + content_h, box_x: box_x + content_w] = line_alpha

    frame = Image.new("L", (width, height), 0)
    if framed:
        shadow = 12
        darkness[box_y + shadow: box_y + box_h + shadow, box_x + box_w: box_x + box_w + shadow] = 0.35
        darkness[box_y + box_h: box_y + box_h + shadow, box_x + shadow: box_x + box_w + shadow] = 0.35
        draw = ImageDraw.Draw(frame)
        draw.rounded_rectangle([box_x, box_y, box_x + box_w, box_y + box_h], radius=10, outline=255, width=3)
        draw.line([box_x, box_y + chrome, box_x + box_w, box_y + chrome], fill=255, width=2)
        for index in range(3):
            centre_x = box_x + 16 + index * 16
            centre_y = box_y + chrome // 2
            draw.ellipse([centre_x - 4, centre_y - 4, centre_x + 4, centre_y + 4], outline=255, width=2)
    frame_alpha = np.asarray(frame, dtype=np.float32) / 255

    rng = np.random.default_rng(7)
    canvas = np.broadcast_to(PAPER, (height, width, 3)).copy()
    canvas += rng.normal(0, 2.0, (height, width, 1))
    if framed:
        canvas[box_y: box_y + box_h, box_x: box_x + box_w] = WINDOW_FILL
    canvas[dot_screen(darkness, height, width)] = DOT_INK
    total_alpha = np.maximum(alpha, frame_alpha)[..., None]
    canvas = canvas * (1 - total_alpha) + LINE_INK * total_alpha
    return Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", type=Path)
    parser.add_argument("--unframed", action="store_true", help="Full-bleed illustration, no window frame")
    parser.add_argument("--invert", choices=["auto", "yes", "no"], default="auto")
    parser.add_argument("--out", type=Path, help="Output path (default: <stem>-halftone.jpg next to source)")
    args = parser.parse_args()
    invert = {"auto": None, "yes": True, "no": False}[args.invert]
    out = args.out or args.source.with_name(args.source.stem + "-halftone.jpg")
    halftone(args.source, framed=not args.unframed, invert=invert).save(out, quality=86, optimize=True, progressive=True)
    print(out)


if __name__ == "__main__":
    main()
