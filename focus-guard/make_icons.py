from PIL import Image, ImageDraw
import os

sizes = [16, 48, 128]
out_dir = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(out_dir, exist_ok=True)

bg = (79, 70, 229, 255)       # indigo
ring = (255, 255, 255, 255)
dot = (255, 255, 255, 255)

for size in sizes:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    radius = size * 0.22
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=bg)

    cx = cy = size / 2
    outer_r = size * 0.33
    mid_r = size * 0.20
    inner_r = size * 0.09

    draw.ellipse([cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r], outline=ring, width=max(1, round(size * 0.06)))
    draw.ellipse([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill=dot)

    img.save(os.path.join(out_dir, f"icon{size}.png"))

print("done")
