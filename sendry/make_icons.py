from PIL import Image, ImageDraw
import os

sizes = [16, 48, 128]
out_dir = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(out_dir, exist_ok=True)

bg = (217, 119, 6, 255)       # amber
fg = (255, 255, 255, 255)

for size in sizes:
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=bg)

    # speech bubble
    left, top, right, bottom = s * 0.2, s * 0.2, s * 0.8, s * 0.68
    draw.rounded_rectangle([left, top, right, bottom], radius=s * 0.1, fill=fg)
    draw.polygon([(s * 0.32, bottom - 1), (s * 0.3, s * 0.82), (s * 0.46, bottom - 1)], fill=fg)

    # exclamation mark
    cx = s / 2
    bar_w = s * 0.07
    draw.rounded_rectangle([cx - bar_w / 2, s * 0.28, cx + bar_w / 2, s * 0.5], radius=bar_w / 2, fill=bg)
    dot_r = s * 0.045
    draw.ellipse([cx - dot_r, s * 0.57 - dot_r, cx + dot_r, s * 0.57 + dot_r], fill=bg)

    img = img.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(out_dir, f"icon{size}.png"))

print("done")
