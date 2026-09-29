from PIL import Image, ImageDraw
import os

sizes = [16, 48, 128]
out_dir = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(out_dir, exist_ok=True)

bg = (13, 148, 136, 255)        # teal
plane = (255, 255, 255, 255)
plane_fold = (204, 251, 241, 255)
badge = (250, 204, 21, 255)     # yellow check badge

# Draw at 512px and downscale, so small sizes get smooth edges.
S = 512

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=bg)

# Paper plane pointing up-right: the message being sent.
cx, cy, size = S * 0.45, S * 0.5, S * 0.36
tail, nose, wing, fold = [(cx + x * size, cy + y * size) for x, y in [(-0.55, 0.05), (0.55, -0.45), (0.05, 0.55), (-0.08, 0.12)]]
draw.polygon([tail, nose, fold], fill=plane)
draw.polygon([fold, nose, wing], fill=plane_fold)

# Check badge in the corner: checked before it leaves. The ring in the background colour
# separates it from the plane.
r = S * 0.15
bx, by = S * 0.72, S * 0.72
draw.ellipse([bx - r - 14, by - r - 14, bx + r + 14, by + r + 14], fill=bg)
draw.ellipse([bx - r, by - r, bx + r, by + r], fill=badge)
draw.line([(bx - r * 0.5, by), (bx - r * 0.1, by + r * 0.42), (bx + r * 0.55, by - r * 0.4)],
          fill=bg, width=int(S * 0.035), joint="curve")

for size in sizes:
    img.resize((size, size), Image.LANCZOS).save(os.path.join(out_dir, f"icon{size}.png"))

print("done")
