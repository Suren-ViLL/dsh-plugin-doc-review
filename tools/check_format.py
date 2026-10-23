"""Check that an edit keeps the formatting of the runs around it.

A paragraph is built with mixed formatting — a bold run in the middle, a
coloured one at the end — and a table cell is built the same way. A few
characters are then changed through the same tool the panel uses, and the
runs are read back to see what survived.
"""

import json
import os
import subprocess
import sys
import tempfile

PYTHON = r"C:\Users\szp01\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
TOOL = r"C:\Users\szp01\Desktop\WORK STATION\DSH\dsh-doc-review\tools\doc_apply_text.py"


def build_docx(path):
    import docx
    from docx.shared import Pt, RGBColor

    document = docx.Document()
    paragraph = document.add_paragraph()
    paragraph.add_run("开头普通 ")
    bold = paragraph.add_run("加粗部分")
    bold.bold = True
    bold.font.size = Pt(16)
    paragraph.add_run(" 结尾正常")

    table = document.add_table(rows=1, cols=1)
    cell = table.cell(0, 0)
    cell.text = ""
    inner = cell.paragraphs[0]
    inner.add_run("单元格普通 ")
    marked = inner.add_run("单元格加粗")
    marked.bold = True
    marked.font.color.rgb = RGBColor(0xC0, 0x39, 0x2B)
    inner.add_run(" 单元格结尾")
    document.save(path)


def read_docx(path):
    import docx

    document = docx.Document(path)
    out = []
    for paragraph in document.paragraphs:
        if paragraph.text.strip() == "":
            continue
        out.append({
            "text": paragraph.text,
            "runs": [
                {"text": run.text, "bold": run.bold, "size": run.font.size.pt if run.font.size else None}
                for run in paragraph.runs
            ],
        })
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    if paragraph.text.strip() == "":
                        continue
                    out.append({
                        "cell": paragraph.text,
                        "runs": [
                            {"text": run.text, "bold": run.bold, "size": run.font.size.pt if run.font.size else None}
                            for run in paragraph.runs
                        ],
                    })
    return out


def apply(path, edits):
    payload = json.dumps({"edits": edits}, ensure_ascii=False)
    result = subprocess.run([PYTHON, TOOL, path], input=payload, capture_output=True, text=True, encoding="utf-8")
    return result.stdout.strip()


def main():
    work = tempfile.mkdtemp(prefix="fmt-test-")
    path = os.path.join(work, "mixed.docx")
    build_docx(path)
    print("=== before")
    for entry in read_docx(path):
        print(" ", json.dumps(entry, ensure_ascii=False))

    # A small change inside each piece of text.
    answer = apply(path, [
        {"id": "p:0", "text": "开头普通 加粗部分 结尾正常", "newText": "开头普通 加粗部分改了 结尾正常", "whole": True},
        {"id": "t:0:0:0", "text": "单元格普通 单元格加粗 单元格结尾", "newText": "单元格普通 单元格加粗！ 单元格结尾", "whole": True},
    ])
    print("=== the tool said:", answer)
    print("=== after")
    for entry in read_docx(path):
        print(" ", json.dumps(entry, ensure_ascii=False))


if __name__ == "__main__":
    main()
