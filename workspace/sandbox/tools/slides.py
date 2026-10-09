# Lecture slide extractor. Runs INSIDE the sandbox (uploaded files are never parsed on the host):
#   python3 slides.py <file.pdf|.pptx|.md|.txt> <output-dir>
# Writes <output-dir>/lecture.json with per-page text, plus page/slide images.
import html
import json
import os
import re
import subprocess
import sys
import zipfile

MAX_PAGES = 300
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
ext = os.path.splitext(src)[1].lower()
pages = []
warnings = []


def num(s):
    m = re.findall(r"\d+", s)
    return int(m[-1]) if m else 0


if ext == ".pdf":
    text = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", src, "-"], capture_output=True, text=True, timeout=180).stdout
    parts = text.split("\f")
    while parts and not parts[-1].strip():
        parts.pop()
    # Page images, so slides with diagrams and math are readable (and circle-able on a board).
    r = subprocess.run(["pdftoppm", "-png", "-scale-to", "1280", "-l", str(MAX_PAGES), src, os.path.join(out, "page")],
                       capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        warnings.append("Could not render page images: " + r.stderr.strip()[:200])
    imgs = sorted((f for f in os.listdir(out) if f.startswith("page") and f.endswith(".png")), key=num)
    for i in range(min(MAX_PAGES, max(len(parts), len(imgs)))):
        pages.append({"n": i + 1, "text": parts[i].strip() if i < len(parts) else "",
                      "image": imgs[i] if i < len(imgs) else None, "images": []})
elif ext == ".pptx":
    z = zipfile.ZipFile(src)
    names = set(z.namelist())
    slides = sorted((n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)), key=num)
    for i, s in enumerate(slides[:MAX_PAGES]):
        xml = z.read(s).decode("utf-8", "ignore")
        lines = []
        for p in re.findall(r"<a:p\b[^>]*>(.*?)</a:p>", xml, re.S):
            t = "".join(re.findall(r"<a:t>([^<]*)</a:t>", p))
            if t.strip():
                lines.append(html.unescape(t))
        images = []
        rels = f"ppt/slides/_rels/{os.path.basename(s)}.rels"
        if rels in names:
            for target in re.findall(r'Type="[^"]*/image"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Type="[^"]*/image"', z.read(rels).decode("utf-8", "ignore")):
                t = target[0] or target[1]
                media = os.path.normpath(os.path.join("ppt/slides", t)).replace("\\", "/")
                e = os.path.splitext(media)[1].lower()
                if media in names and e in (".png", ".jpg", ".jpeg", ".gif"):
                    name = f"slide-{i + 1:03d}-{len(images) + 1}{e}"
                    with open(os.path.join(out, name), "wb") as f:
                        f.write(z.read(media))
                    images.append(name)
        pages.append({"n": i + 1, "text": "\n".join(lines), "image": None, "images": images})
    warnings.append("PowerPoint: text and pictures were extracted, but slide layout isn't rendered. For exact slides, export to PDF and upload that.")
elif ext in (".md", ".txt"):
    with open(src, encoding="utf-8", errors="replace") as f:
        pages.append({"n": 1, "text": f.read(), "image": None, "images": []})
else:
    print(json.dumps({"error": f"Unsupported file type {ext}. Upload PDF, PPTX, MD or TXT."}))
    sys.exit(1)

doc = {"source": os.path.basename(src), "kind": ext[1:], "pages": pages, "warnings": warnings}
with open(os.path.join(out, "lecture.json"), "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False)
print(json.dumps({"ok": True, "pages": len(pages), "warnings": warnings}))
