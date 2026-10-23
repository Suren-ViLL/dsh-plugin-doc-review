"""Read the edited text out of an HTML report, and write it back.

An HTML report is reviewed as it is: the human edits the words where they see
them. This collects the changed text nodes and, on the way back, puts the
new text into the file, leaving the markup around them alone.

    python doc_html.py extract <html file>     <- {"edits": [...]} on stdin
    python doc_html.py apply   <html file>     <- {"edits": [...]} on stdin
"""

import json
import os
import re
import shutil
import sys
import time

MAX_EDIT_CHARS = 20000


def fail(message):
    sys.stdout.write(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    sys.exit(1)


# A tag, a comment, or a doctype: everything that is not text.
_MARKUP = re.compile(r"<(?:!--.*?-->|/?[a-zA-Z][^>]*>|\?.*?\?>|!\[CDATA\[.*?\]\]>)", re.S)

# The content of these elements is code, not prose, and must not be edited.
_CODE_ELEMENTS = ("style", "script", "noscript", "template", "code", "pre")


def text_nodes(html):
    """Every text run in the document, with the offsets it occupies.

    The content of a style or script element is code, so it is left out: the
    human edits the report's words, not its stylesheet.
    """
    nodes = []
    position = 0
    for match in _MARKUP.finditer(html):
        chunk = html[position:match.start()]
        if chunk.strip() != "" and not _inside_code(html, position):
            nodes.append((position, match.start(), chunk))
        position = match.end()
    tail = html[position:]
    if tail.strip() != "" and not _inside_code(html, position):
        nodes.append((position, len(html), tail))
    return nodes


def _inside_code(html, offset):
    """Whether the offset falls inside a style or script element."""
    for name in _CODE_ELEMENTS:
        open_tag = html.rfind(f"<{name}", 0, offset)
        if open_tag < 0:
            continue
        close_tag = html.find(f"</{name}>", open_tag)
        if close_tag < 0 or offset < close_tag:
            return True
    return False


def extract(html):
    """The text runs the browser can edit, addressed by their offset."""
    nodes = []
    for index, (start, end, chunk) in enumerate(text_nodes(html)):
        nodes.append({
            "id": f"t{index}",
            "offset": start,
            "text": chunk[:MAX_EDIT_CHARS],
        })
    return nodes


def apply_edits(html, edits):
    """Put the new text back, keeping every tag where it was."""
    nodes = text_nodes(html)
    by_offset = {start: (start, end, original) for start, end, original in nodes}
    replacements = []
    for edit in edits:
        new_text = str(edit.get("newText", ""))
        original = str(edit.get("text", ""))
        found = None
        try:
            offset = int(edit.get("offset", -1))
        except (TypeError, ValueError):
            offset = -1
        if offset >= 0:
            found = by_offset.get(offset)
        if found is None and original != "":
            # The offset is only a hint: the text itself finds the place, so
            # a report that was touched in between still writes correctly.
            for start, end, chunk in nodes:
                if chunk.strip() == original.strip():
                    found = (start, end, chunk)
                    break
        if found is None:
            continue
        start, end, _ = found
        if new_text == original:
            continue
        replacements.append((start, end, new_text))
    if not replacements:
        return html, 0
    # Apply from the back so earlier offsets stay valid.
    replacements.sort(key=lambda item: item[0], reverse=True)
    out = html
    applied = 0
    for start, end, new_text in replacements:
        out = out[:start] + new_text + out[end:]
        applied += 1
    return out, applied


def main():
    if len(sys.argv) < 3:
        fail("usage: doc_html.py <extract|apply> <html file>")
    action = sys.argv[1]
    path = os.path.abspath(sys.argv[2])
    if not os.path.isfile(path):
        fail(f"not a file: {path}")

    try:
        with open(path, "r", encoding="utf-8", newline="") as handle:
            html = handle.read()
    except Exception as error:  # noqa: BLE001
        fail(str(error))

    if action == "extract":
        sys.stdout.write(json.dumps({
            "ok": True,
            "file": path,
            "nodes": extract(html),
        }, ensure_ascii=False))
        sys.exit(0)

    if action == "apply":
        try:
            payload = json.load(sys.stdin)
        except Exception as error:  # noqa: BLE001
            fail(f"invalid payload: {error}")
        edits = payload.get("edits") if isinstance(payload, dict) else None
        if not isinstance(edits, list) or len(edits) == 0:
            fail("payload.edits must be a non-empty list")
        updated, applied = apply_edits(html, edits)
        if applied == 0:
            fail("no edit matched this document — reload the panel and retry")
        backup = f"{path}.bak-{time.strftime('%Y%m%d-%H%M%S')}"
        shutil.copy2(path, backup)
        try:
            with open(path, "w", encoding="utf-8", newline="") as handle:
                handle.write(updated)
        except Exception as error:  # noqa: BLE001
            shutil.move(backup, path)
            fail(str(error))
        sys.stdout.write(json.dumps({
            "ok": True, "file": path, "applied": applied, "backup": backup,
        }, ensure_ascii=False))
        sys.exit(0)

    fail(f"unknown action: {action}")


if __name__ == "__main__":
    main()
