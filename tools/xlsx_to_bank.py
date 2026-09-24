#!/usr/bin/env python3
"""
Банк заданий части 1: xlsx -> bank.json (грузится сайтом при открытии «Банка заданий»).

    pip install openpyxl
    python3 tools/xlsx_to_bank.py "Первая часть (старое).xlsx"

Формат таблицы: лист = блок (ЧиО, Экономика, …), строка-заголовок темы
«1.1. Человек как …» в колонке «Задание», дальше задания темы:
№ в ЕГЭ | Источник | Задание | Ответ | Пояснение | Комментарий.
Пропускаются строки без номера или ответа и задания с источником «Устаревшее».
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

OUT = Path(__file__).resolve().parent.parent / "bank.json"
BLOCKS = {  # имя листа -> название блока на сайте
    "ЧиО": "Человек и общество",
    "Экономика": "Экономика",
    "Социология": "Социальные отношения",
    "Политика": "Политика",
    "Право": "Право",
}
TOPIC_RE = re.compile(r"^\s*(\d+\.\d+)\.?\s*(.+)$", re.S)


def clean(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).replace("\r", "").replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def main(path: str):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    topics, questions, skipped = [], [], []
    for ws in wb.worksheets:
        block = BLOCKS.get(ws.title.strip())
        if not block:
            continue
        topic = None
        for r, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
            n, src, text, ans, expl = (list(row) + [None] * 5)[:5]
            text, ans = clean(text), clean(ans)
            m = TOPIC_RE.match(text)
            if n is None and not ans and m:
                name = re.sub(r"\s+", " ", m.group(2)).strip()
                topic = m.group(1)
                topics.append({"code": topic, "name": name, "block": block})
                continue
            if not text and not ans:
                continue
            if n is None or not ans or not text or not topic or clean(src) == "Устаревшее":
                skipped.append(f"{ws.title.strip()}:{r}")
                continue
            q = {"n": clean(n), "text": text, "answer": re.sub(r"\D", "", ans), "block": block, "topic": topic}
            if clean(expl):
                q["explanation"] = clean(expl)
            questions.append(q)

    used = {q["topic"] for q in questions}
    topics = [t for t in topics if t["code"] in used]
    data = {"blocks": list(BLOCKS.values()), "topics": topics, "questions": questions}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(questions)} заданий, {len(topics)} тем -> {OUT.name} ({OUT.stat().st_size // 1024} КБ)")
    print(f"Пропущено строк: {len(skipped)}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "Первая часть (старое).xlsx")
