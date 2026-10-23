"""The editable text of a document, positioned on its pages.

The panel shows a rendered picture of the document and puts an editor over
it. The editor needs to know where each *paragraph* sits, not where each
fragment of text the PDF happens to split into sits: Office edits a line at a
time, and so does this.

So the document is read twice — once for its own paragraphs, once for the PDF
the renderer produced — and the two are matched. The result is one box per
paragraph, which the panel can turn into an editable region.

    python doc_textblocks.py <document>

Output: { "ok": true, "pages": [ { "index": 1, "width": ..., "height": ... } ],
          "blocks": [ { "id": "p:3", "text": "...", "page": 1, "heading": 1,
                        "box": { "x": .., "y": .., "w": .., "h": .. },
                        "size": 12.0 } ] }

The box is in PDF points with the origin at the bottom left.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile


def fail(message):
    sys.stdout.write(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    sys.exit(1)


# ── The document's own paragraphs ────────────────────────────────────────────


def docx_blocks(path):
    import docx

    document = docx.Document(path)
    # The type the body is set in: a heading is set larger than that.
    sizes = []
    for paragraph in document.paragraphs:
        for run in paragraph.runs:
            if run.font.size is not None:
                sizes.append(run.font.size.pt)
    body_size = 0.0
    if len(sizes) > 0:
        body_size = sorted(sizes)[len(sizes) // 2]

    blocks = []
    for index, paragraph in enumerate(document.paragraphs):
        if paragraph.text.strip() != "":
            blocks.append({
                "id": f"p:{index}",
                "text": paragraph.text,
                "heading": _docx_heading(paragraph, body_size),
            })
    for table_index, table in enumerate(document.tables):
        for row_index, row in enumerate(table.rows):
            for col_index, cell in enumerate(row.cells):
                if cell.text.strip() != "":
                    blocks.append({
                        "id": f"t:{table_index}:{row_index}:{col_index}",
                        "text": cell.text,
                        "heading": None,
                    })
    return blocks


# A numbered heading: "1", "2.1", "3.2.4" and a trailing space.
_NUMBERED = re.compile(r"^(\d+(?:\.\d+)*)\s*\S")


def _docx_heading(paragraph, body_size):
    """The heading level of a Word paragraph, or None.

    A document that never used the heading styles still has a shape: its
    headings are numbered and set in a larger, often bold, type. That is read
    here, so the outline works on such a document too.
    """
    style = paragraph.style.name if paragraph.style is not None else "Normal"
    lowered = str(style).strip().lower()
    if lowered.startswith("heading") or lowered.startswith("标题"):
        tail = lowered[6:] if lowered.startswith("heading") else lowered[2:]
        try:
            return max(1, min(6, int(tail.strip())))
        except ValueError:
            return 1
    if lowered in ("title", "subtitle", "标题", "副标题"):
        return 1

    text = paragraph.text.strip()
    if text == "":
        return None
    match = _NUMBERED.match(text)
    if match is None:
        return None
    # The numbering gives the depth: "2.1" is one level below "2".
    depth = match.group(1).count(".") + 1
    if depth > 6:
        return None
    # A heading is short and set in a larger type than the body.
    if len(text) > 60:
        return None
    sizes = [
        run.font.size.pt
        for run in paragraph.runs
        if run.font.size is not None
    ]
    size = max(sizes) if len(sizes) > 0 else body_size
    if size < body_size:
        return None
    bold = any(run.bold is True for run in paragraph.runs)
    if not bold and size <= body_size:
        return None
    return min(6, depth)


def pptx_blocks(path):
    """Every paragraph of a slide, with the shape it belongs to.

    A slide is edited one *shape* at a time, the way PowerPoint does it: the
    human picks a text block and opens it, rather than typing on the slide.
    The shape is therefore carried with each paragraph.
    """
    from pptx import Presentation

    presentation = Presentation(path)
    blocks = []
    for slide_index, slide in enumerate(presentation.slides):
        for shape_index, shape in enumerate(slide.shapes):
            if not getattr(shape, "has_text_frame", False):
                continue
            shape_id = f"s:{slide_index}:{shape_index}"
            seen = False
            for para_index, paragraph in enumerate(shape.text_frame.paragraphs):
                if paragraph.text.strip() == "":
                    continue
                seen = True
                blocks.append({
                    "id": f"{shape_id}:{para_index}",
                    "text": paragraph.text,
                    "heading": None,
                    "shape": shape_id,
                    "shapeName": str(getattr(shape, "name", "") or ""),
                    "first": False,
                })
            if seen:
                # The first paragraph of the shape carries what the block as a
                # whole looks like, so the panel can offer it as one object.
                for block in reversed(blocks):
                    if block.get("shape") == shape_id:
                        block["blockText"] = "\n".join(
                            other["text"] for other in blocks if other.get("shape") == shape_id
                        )
                        break
    if len(blocks) > 0:
        blocks[0]["first"] = True
    return blocks


# ── The PDF the renderer produced ────────────────────────────────────────────


def convert_to_pdf(document_path, cli_path, node_path):
    workdir = tempfile.mkdtemp(prefix="dsh-textblocks-")
    outdir = os.path.join(workdir, "out")
    os.makedirs(outdir, exist_ok=True)
    env = dict(os.environ)
    env.setdefault("ELECTRON_RUN_AS_NODE", "1")
    result = subprocess.run(
        [node_path, cli_path, "convert", "--input", document_path, "--output", os.path.join(outdir, "document.pdf")],
        capture_output=True, text=True, env=env, timeout=240,
    )
    target = os.path.join(outdir, "document.pdf")
    if not os.path.isfile(target):
        fail(f"conversion produced no PDF: {result.stdout[:200]} {result.stderr[:200]}")
    return target, workdir


def page_runs(page):
    """Every text run on one PDF page, with its position and size."""
    runs = []

    def visitor(text, cm, tm, font_dict, font_size):
        if text.strip() == "":
            return
        runs.append({
            "text": text,
            "x": float(tm[4]),
            "y": float(tm[5]),
            "size": float(font_size) if font_size else 0.0,
        })

    page.extract_text(visitor_text=visitor)
    return runs


def measure(runs):
    """Give each run an estimated width, for its hit area."""
    for run in runs:
        width = 0.0
        for character in run["text"]:
            if character == " ":
                width += run["size"] * 0.28
            elif ord(character) > 0x2E80:
                width += run["size"] * 1.0
            else:
                width += run["size"] * 0.52
        run["width"] = width
        run["height"] = run["size"] * 1.35
    return runs


# ── Matching the two ─────────────────────────────────────────────────────────

_WHITESPACE = re.compile(r"\s+")


def normalise(text):
    """A comparable form of the text: no spaces, no line breaks."""
    return _WHITESPACE.sub("", text)


def build_index(pages):
    """One string over every page's text, with a map back to the runs."""
    parts = []
    origin = []
    for page_index, page in enumerate(pages):
        for run_index, run in enumerate(page["runs"]):
            for offset, character in enumerate(run["text"]):
                if character.isspace():
                    continue
                parts.append(character)
                origin.append((page_index, run_index, offset))
    return "".join(parts), origin


def main():
    if len(sys.argv) < 2:
        fail("usage: doc_textblocks.py <document>")
    document = os.path.abspath(sys.argv[1])
    if not os.path.isfile(document):
        fail(f"not a file: {document}")
    ext = os.path.splitext(document)[1].lower()
    if ext == ".docx":
        blocks = docx_blocks(document)
    elif ext == ".pptx":
        blocks = pptx_blocks(document)
    else:
        fail(f"text blocks are not supported for {ext}")

    # The words alone are enough for the text view, and reading them costs a
    # few hundred milliseconds instead of the seconds a PDF match takes.
    if "--text-only" in sys.argv:
        sys.stdout.write(json.dumps({
            "ok": True,
            "document": document,
            "pages": [],
            "blocks": [
                {
                    **{key: value for key, value in block.items() if key != "id"},
                    "id": block["id"],
                    "blockId": block["id"],
                    "page": 0,
                    "box": {"x": 0, "y": 0, "w": 0, "h": 0},
                    "size": 0,
                }
                for block in blocks
            ],
        }, ensure_ascii=False))
        sys.exit(0)

    # The PDF may be handed over: the Host makes one per document and shares
    # it, so the document is turned into a PDF only once.
    given = os.environ.get("DSH_DOC_REVIEW_PDF", "")
    workdir = None
    if given != "" and os.path.isfile(given):
        pdf_path = given
    else:
        cli_path = os.environ.get("DSH_DOC_REVIEW_CLI", "")
        node_path = os.environ.get("DSH_DOC_REVIEW_NODE", "")
        if cli_path == "" or node_path == "":
            fail("DSH_DOC_REVIEW_CLI and DSH_DOC_REVIEW_NODE must be set")
        pdf_path, workdir = convert_to_pdf(document, cli_path, node_path)
    try:
        from pypdf import PdfReader

        reader = PdfReader(pdf_path)
        pages = []
        for index, page in enumerate(reader.pages):
            pages.append({
                "index": index + 1,
                "width": round(float(page.mediabox.width), 1),
                "height": round(float(page.mediabox.height), 1),
                "runs": measure(page_runs(page)),
            })
    finally:
        if workdir is not None:
            shutil.rmtree(workdir, ignore_errors=True)

    haystack, origin = build_index(pages)

    placed = []
    cursor = 0
    for block in blocks:
        needle = normalise(block["text"])[:120]
        if len(needle) < 2:
            continue
        # The paragraph is looked for from the last one onwards, so the
        # paragraphs keep their order on the page. A paragraph that is not
        # found does not move the cursor, so a single miss does not push every
        # paragraph after it onto the wrong page.
        at = haystack.find(needle, cursor)
        if at < 0:
            # The document may list its paragraphs in another order than the
            # renderer prints them; the whole text is searched in that case.
            at = haystack.find(needle)
        if at < 0:
            continue
        if at >= cursor:
            cursor = at + len(needle)

        # The runs this paragraph covers, grouped by the page they are on.
        by_page = {}
        for index in range(at, at + len(needle)):
            page_index, run_index, offset = origin[index]
            by_page.setdefault(page_index, {}).setdefault(run_index, []).append(offset)

        for page_index, run_map in by_page.items():
            page = pages[page_index]
            runs = [page["runs"][run_index] for run_index in sorted(run_map)]
            left = min(run["x"] for run in runs)
            bottom = min(run["y"] for run in runs)
            right = max(run["x"] + run["width"] for run in runs)
            top = max(run["y"] + run["height"] for run in runs)
            placed.append({
                **{key: value for key, value in block.items() if key not in ("id", "text", "heading")},
                "id": block["id"] if len(by_page) == 1 else f"{block['id']}@{page_index + 1}",
                "blockId": block["id"],
                "text": block["text"],
                "heading": block["heading"],
                "page": page_index + 1,
                "box": {
                    "x": round(left, 1),
                    "y": round(bottom, 1),
                    "w": round(right - left, 1),
                    "h": round(top - bottom, 1),
                },
                "size": round(max(run["size"] for run in runs), 1),
            })

    sys.stdout.write(json.dumps({
        "ok": True,
        "document": document,
        "pages": [{ "index": page["index"], "width": page["width"], "height": page["height"] } for page in pages],
        "blocks": placed,
    }, ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()
