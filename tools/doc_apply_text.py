"""Write an edited text run back into the document it came from.

The panel shows the document as a picture with a text layer over it, and the
human edits a run in place. The run is a fragment of one paragraph, so the
edit is applied to the paragraph that contains it: the fragment's original
text is located inside the paragraph and replaced there, which keeps every
other run of that paragraph — its bold text, its inline font changes —
untouched.

    python doc_apply_text.py <document>       <- {"edits": [...]} on stdin

An edit: { "id": "p:12" | "t:0:1:2" | "s:1:3:0", "text": "原文",
           "newText": "改后", "whole": false }

The edit is mapped onto the paragraph's runs with a sequence diff, so the
formatting of each surviving run (its rPr — font, size, colour, bold) is
never rewritten: only the characters each run holds change. A paragraph that
mixed a bold lead-in with plain body text still does after an edit.
"""

import difflib
import json
import os
import shutil
import sys
import time

MAX_BLOCK_CHARS = 20000


def fail(message):
    sys.stdout.write(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    sys.exit(1)


# ── the paragraph's runs, as one string plus the spans each run owns ─────────


def _run_text(run):
    return run.text if run.text is not None else ""


def _spans(runs):
    """[(run, start, end), ...] — where each run sits in the joined text."""
    spans = []
    at = 0
    for run in runs:
        text = _run_text(run)
        spans.append((run, at, at + len(text)))
        at += len(text)
    return spans


def _apply_ops(runs, spans, old_text, new_text):
    """Rewrite `runs` in place so the paragraph reads `new_text`.

    Every run keeps its own formatting object; only its characters change.
    A replacement is written into the run that held the start of the replaced
    range, so the edited words inherit the local formatting — which is what a
    human expects when they retype a bold word.

    Returns the number of runs whose text actually changed.
    """
    if old_text == new_text:
        return 0

    matcher = difflib.SequenceMatcher(None, old_text, new_text, autojunk=False)
    opcodes = matcher.get_opcodes()

    # Current character content of each run, as a mutable list, so several
    # opcodes can touch the same run without fighting over its .text.
    buffers = [list(_run_text(run)) for run in runs]

    def run_at(position):
        """The index of the run that holds `position` (clamped to the ends)."""
        for index, (_run, start, end) in enumerate(spans):
            if start <= position < end:
                return index
        # Past the end: the last run that has any text, else run 0.
        for index in range(len(spans) - 1, -1, -1):
            if spans[index][2] > spans[index][1]:
                return index
        return 0

    def local_offset(index_of_run, position):
        _run, start, _end = spans[index_of_run]
        return max(0, min(len(buffers[index_of_run]), position - start))

    # Walk the opcodes back to front: earlier offsets stay valid.
    for tag, i1, i2, j1, j2 in reversed(opcodes):
        if tag == "equal":
            continue
        if tag in ("replace", "delete", "insert"):
            insertion = new_text[j1:j2]
            if tag == "replace" or tag == "delete":
                # Remove old_text[i1:i2], then insert the replacement there.
                cursor = i1
                remaining = i2 - i1
                while remaining > 0:
                    index = run_at(cursor)
                    offset = local_offset(index, cursor)
                    room = len(buffers[index]) - offset
                    take = min(room, remaining)
                    del buffers[index][offset:offset + take]
                    cursor += take
                    remaining -= take
                    if take == 0 and remaining > 0:
                        # Degenerate span; step past it to avoid a loop.
                        cursor += 1
                        remaining -= 1
                target = run_at(i1 if i1 < len(old_text) else max(0, len(old_text) - 1))
                offset = local_offset(target, i1)
                buffers[target][offset:offset] = list(insertion)
            else:  # insert
                target = run_at(i1 if i1 < len(old_text) else max(0, len(old_text) - 1))
                offset = local_offset(target, i1)
                buffers[target][offset:offset] = list(insertion)

    changed = 0
    for index, run in enumerate(runs):
        text = "".join(buffers[index])
        if text != _run_text(run):
            run.text = text
            changed += 1
    return changed


def _set_paragraph_text(paragraph, text):
    """Replace a paragraph's text, keeping each run's own formatting.

    Falls back to a single new run only when the paragraph had no runs at all
    (a genuinely empty paragraph).
    """
    runs = list(paragraph.runs)
    if len(runs) == 0:
        paragraph.add_run(text)
        return 0
    old_text = "".join(_run_text(run) for run in runs)
    return _apply_ops(runs, _spans(runs), old_text, text)


def _cell_runs(cell):
    """Every run of a table cell, in reading order, with its paragraph."""
    pairs = []
    for paragraph in cell.paragraphs:
        for run in paragraph.runs:
            pairs.append((paragraph, run))
    return pairs


def _set_cell_text(cell, text, paragraph_index=None):
    """Replace a cell's text, keeping formatting, for one paragraph of it."""
    paragraphs = list(cell.paragraphs)
    if len(paragraphs) == 0:
        cell.text = text
        return 0
    if paragraph_index is not None and 0 <= paragraph_index < len(paragraphs):
        # A targeted paragraph: everything else in the cell stays as it was.
        target = paragraphs[paragraph_index]
        return _set_paragraph_text(target, text)
    # The usual case: the cell reads as one string; put it in the first
    # paragraph and blank the rest.
    changed = _set_paragraph_text(paragraphs[0], text)
    for extra in paragraphs[1:]:
        changed += _set_paragraph_text(extra, "")
    return changed


# ── locating the holder of an edit ──────────────────────────────────────────


def docx_paragraphs(path):
    import docx

    document = docx.Document(path)
    entries = []
    for index, paragraph in enumerate(document.paragraphs):
        entries.append((f"p:{index}", paragraph.text, paragraph, None))
    for table_index, table in enumerate(document.tables):
        for row_index, row in enumerate(table.rows):
            for col_index, cell in enumerate(row.cells):
                entries.append((
                    f"t:{table_index}:{row_index}:{col_index}",
                    cell.text, cell, None,
                ))
    return document, entries


def pptx_paragraphs(path):
    from pptx import Presentation

    presentation = Presentation(path)
    entries = []
    for slide_index, slide in enumerate(presentation.slides):
        for shape_index, shape in enumerate(slide.shapes):
            if getattr(shape, "has_text_frame", False):
                for para_index, paragraph in enumerate(shape.text_frame.paragraphs):
                    entries.append((
                        f"s:{slide_index}:{shape_index}:{para_index}",
                        paragraph.text, paragraph, "pptx",
                    ))
            if getattr(shape, "has_table", False):
                for row_index, row in enumerate(shape.table.rows):
                    for col_index, cell in enumerate(row.cells):
                        entries.append((
                            f"s:{slide_index}:{shape_index}:t:{row_index}:{col_index}",
                            cell.text, cell, "pptx-cell",
                        ))
    return presentation, entries


def replace_inside(original, needle, replacement):
    """Replace the first occurrence of `needle` in `original`."""
    if needle == "":
        return None
    at = original.find(needle)
    if at < 0:
        # The run may have been split differently; try its trimmed form.
        trimmed = needle.strip()
        if trimmed == "":
            return None
        at = original.find(trimmed)
        if at < 0:
            return None
        needle = trimmed
    return original[:at] + replacement + original[at + len(needle):]


def main():
    if len(sys.argv) < 2:
        fail("usage: doc_apply_text.py <document>")
    path = os.path.abspath(sys.argv[1])
    if not os.path.isfile(path):
        fail(f"not a file: {path}")
    ext = os.path.splitext(path)[1].lower()

    try:
        payload = json.load(sys.stdin)
    except Exception as error:  # noqa: BLE001
        fail(f"invalid payload: {error}")
    edits = payload.get("edits") if isinstance(payload, dict) else None
    if not isinstance(edits, list) or len(edits) == 0:
        fail("payload.edits must be a non-empty list")

    if ext == ".docx":
        document, entries = docx_paragraphs(path)
    elif ext in (".pptx", ".ppt"):
        if ext == ".ppt":
            fail("in-place text editing needs .pptx (the old binary format cannot be written)")
        document, entries = pptx_paragraphs(path)
    else:
        fail(f"in-place text editing is not supported for {ext}")

    by_id = {entry[0]: entry for entry in entries}

    applied = 0
    missed = []
    for edit in edits:
        needle = str(edit.get("text", ""))
        replacement = str(edit.get("newText", ""))
        if needle == "" and edit.get("whole") is not True:
            continue
        # Prefer the id the panel knows: it names the exact paragraph, which
        # matters when two paragraphs share the same words.
        target = None
        wanted = edit.get("blockId") or edit.get("id")
        if isinstance(wanted, str) and wanted in by_id:
            target = by_id[wanted]
        if target is None:
            for _, original, holder, flavour in entries:
                if needle in original:
                    target = (_, original, holder, flavour)
                    break
        if target is None:
            trimmed = needle.strip()
            for _, original, holder, flavour in entries:
                if trimmed != "" and trimmed in original:
                    target = (_, original, holder, flavour)
                    break
        if target is None:
            missed.append(needle[:40])
            continue
        entry_id, original, holder, flavour = target
        # A paragraph-level edit replaces the whole paragraph; a fragment-level
        # one replaces just that fragment inside it.
        if edit.get("whole") is True:
            updated = replacement
        else:
            updated = replace_inside(original, needle, replacement)
        if updated is None:
            missed.append(needle[:40])
            continue

        if flavour == "pptx":
            # `holder` is a python-pptx paragraph: rewrite its runs, keep rPr.
            old_text = "".join(_run_text(run) for run in holder.runs)
            runs = list(holder.runs)
            if len(runs) == 0:
                holder.add_run().text = updated
            else:
                _apply_ops(runs, _spans(runs), old_text, updated)
        elif flavour == "pptx-cell":
            # A table cell in a deck: its first paragraph holds the text.
            old_text = "".join(
                _run_text(run) for paragraph in holder.text_frame.paragraphs
                for run in paragraph.runs
            ) if hasattr(holder, "text_frame") else holder.text
            paragraphs = list(holder.text_frame.paragraphs) if hasattr(holder, "text_frame") else []
            if len(paragraphs) == 0:
                holder.text = updated
            else:
                first = paragraphs[0]
                runs = list(first.runs)
                first_old = "".join(_run_text(run) for run in runs)
                if len(runs) == 0:
                    first.add_run().text = updated
                else:
                    _apply_ops(runs, _spans(runs), first_old, updated)
                # Blank the remaining paragraphs of the cell, keeping format.
                for extra in paragraphs[1:]:
                    _set_pptx_paragraph_text(extra, "")
        else:
            # Word: a paragraph or a table cell.
            if hasattr(holder, "runs"):
                _set_paragraph_text(holder, updated)
            else:
                _set_cell_text(holder, updated)
        applied += 1

    if applied == 0:
        fail("no edit matched this document — reload the panel and retry")

    backup = f"{path}.bak-{time.strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(path, backup)
    try:
        document.save(path)
    except Exception as error:  # noqa: BLE001
        shutil.move(backup, path)
        fail(str(error))

    sys.stdout.write(json.dumps({
        "ok": True, "file": path, "applied": applied,
        "missed": missed, "backup": backup,
    }, ensure_ascii=False))
    sys.exit(0)


def _set_pptx_paragraph_text(paragraph, text):
    """Blank or replace one slide paragraph without touching its runs' fonts."""
    runs = list(paragraph.runs)
    old_text = "".join(_run_text(run) for run in runs)
    if len(runs) == 0:
        if text != "":
            paragraph.add_run().text = text
        return
    _apply_ops(runs, _spans(runs), old_text, text)


if __name__ == "__main__":
    main()
