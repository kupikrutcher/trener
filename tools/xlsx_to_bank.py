#!/usr/bin/env python3
"""
Банк заданий: xlsx -> bank.json (грузится сайтом при открытии «Банка заданий»).

    pip install openpyxl
    python3 tools/xlsx_to_bank.py "Первая часть.xlsx" "Вторая часть.xlsx"

Файлов может быть несколько, часть определяется по заголовку листа.
Лист = блок (ЧиО, Экономика, …), строка-заголовок темы «1.1. Человек как …»
в колонке «Задание», дальше задания темы.
Часть 1: № в ЕГЭ | Источник | Задание | Ответ | Пояснение | Комментарий.
Часть 2: № в ЕГЭ | Источник | Задание | Пояснение | Год | Комментарий… —
пояснение становится «Образцом ответа», комментарий «Ключи…» — критериями.
Берутся только задания с пояснением; пропускаются строки без номера,
без ответа (часть 1) и задания с источником «Устаревшее».
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
PTS = {"17": 2, "18": 2, "19": 3, "20": 3, "21": 3, "22": 4, "23": 3, "24": 4, "25": 6}  # баллы части 2
TOPIC_RE = re.compile(r"^\s*(\d+\.\d+)\.?\s*(.+)$", re.S)
KEY_RE = re.compile(r"^\s*(ключи|оригинальный ключ)", re.I)  # комментарий с ключами ФИПИ — в критерии


def clean(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = str(v).replace("\r", "").replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    return re.sub(r"\n{3,}", "\n\n", s).strip()


def read_sheet(ws, topics, questions, skipped):
    block = BLOCKS.get(ws.title.strip())
    if not block:
        return
    rows = ws.iter_rows(values_only=True)
    head = [clean(c).lower() for c in next(rows, ())]
    part2 = "ответ" not in head  # во второй части колонки «Ответ» нет
    topic = None
    for r, row in enumerate(rows, 2):
        row = list(row) + [None] * 8
        n, src, text = row[0], clean(row[1]), clean(row[2])
        if part2:
            ans, expl, notes = "", clean(row[3]), [clean(c) for c in row[5:8]]
        else:
            ans, expl, notes = clean(row[3]), clean(row[4]), []
        m = TOPIC_RE.match(text)
        if n is None and not ans and not expl and m:
            topic = m.group(1)
            if topic not in {t["code"] for t in topics}:
                name = re.sub(r"\s+", " ", m.group(2)).strip()
                topics.append({"code": topic, "name": name, "block": block})
            continue
        if not text and not ans and not expl:
            continue
        if n is None or not text or not topic or src == "Устаревшее" or not expl or (not part2 and not ans):
            skipped.append(f"{ws.title.strip()}:{r}")
            continue
        n = clean(n)
        if part2:
            q = {"part": 2, "n": n, "pts": str(PTS.get(n, "")), "text": text, "answer": expl, "block": block, "topic": topic}
            keys = [c for c in notes if KEY_RE.match(c)]
            if keys:
                q["explanation"] = "\n\n".join(keys)
        else:
            q = {"n": n, "text": text, "answer": re.sub(r"\D", "", ans), "block": block, "topic": topic, "explanation": expl}
        questions.append(q)


def build(paths):
    topics, questions, skipped = [], [], []
    for path in paths:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            read_sheet(ws, topics, questions, skipped)
    used = {q["topic"] for q in questions}
    topics = [t for t in topics if t["code"] in used]
    topics.sort(key=lambda t: [int(x) for x in t["code"].split(".")])
    return {"blocks": list(BLOCKS.values()), "topics": topics, "questions": questions}, skipped


def save(data):
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    p2 = sum(1 for q in data["questions"] if q.get("part") == 2)
    print(f"Часть 1: {len(data['questions']) - p2}, часть 2: {p2}, тем: {len(data['topics'])}"
          f" -> {OUT.name} ({OUT.stat().st_size // 1024} КБ)")


def main(paths):
    data, skipped = build(paths)
    save(data)
    print(f"Пропущено строк (нет номера, ответа или пояснения): {len(skipped)}")


if __name__ == "__main__":
    main(sys.argv[1:] or ["Первая часть.xlsx", "Вторая часть.xlsx"])
