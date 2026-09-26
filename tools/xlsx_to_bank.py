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
Задания части 1 без пояснения собираются из пояснений к тем же вариантам
в других заданиях (банк + tests.json), см. fill_explanations; не нашлось
ко всем вариантам — задание не берём.
"""
import collections
import difflib
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "bank.json"
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
        if n is None or not text or not topic or src == "Устаревшее" or (part2 and not expl) or (not part2 and not ans):
            skipped.append(f"{ws.title.strip()}:{r}")
            continue
        n = clean(n)
        if part2:
            q = {"part": 2, "n": n, "pts": str(PTS.get(n, "")), "text": text, "answer": expl, "block": block, "topic": topic}
            keys = [c for c in notes if KEY_RE.match(c)]
            if keys:
                q["explanation"] = "\n\n".join(keys)
        else:
            q = {"n": n, "text": text, "answer": re.sub(r"\D", "", ans), "block": block, "topic": topic}
            if expl:
                q["explanation"] = expl
        questions.append(q)


# ---- пояснения части 1 из других заданий ----
# Вариант берём, только если он дословно совпал (без регистра, кавычек, ё/е) в задании с тем же номером ЕГЭ
# и с тем же Да/Нет (для соответствия — с тем же элементом второго столбца). Короткий вариант («местный рынок»)
# зависит от условия — его берём только из задания с почти тем же условием.

def norm(s):
    s = s.lower().replace("ё", "е").replace("\xa0", " ")
    s = re.sub(r"[«»\"“”„]", "", s)
    s = re.sub(r"[–—−]", "-", s)
    return re.sub(r"\s+", " ", s).strip(" .;,")


def is_match(t):
    return "установите соответствие" in t.lower()


def options(t):
    """варианты задания: буквы А–Д и цифры -> нормализованный текст"""
    t = re.sub(r"Запишите[^\n]*$", "", t.strip())
    end = r"(?=\s*(?:;\s*)?(?:{}|\n[А-ЯЁ ,()\-]{{6,}}\n|\n\n|$))"
    let = {m.group(1): norm(m.group(2)) for m in re.finditer(
        r"(?:^|\n|;\s*|\s)([А-Д])\)\s*(.+?)" + end.format(r"[А-Д]\)|\d{1,2}\)"), t, re.S)}
    num = {m.group(1): norm(m.group(2)) for m in re.finditer(
        r"(?:^|\n|;\s*|\s)(\d{1,2})\)\s*(.+?)" + end.format(r"\d{1,2}\)"), t, re.S)}
    return let, num


def segs(e, letters):
    """пояснение по пунктам: «1. Да. …» / «А. … — 2. …»"""
    key = r"([А-Д])" if letters else r"(\d{1,2})"
    ms = list(re.finditer(r"(?:^|\n|(?<=[.;:!?)])\s)" + key + r"[.)]\s", e))
    out = {}
    for i, m in enumerate(ms):
        out.setdefault(m.group(1), e[m.start(1):ms[i + 1].start(1) if i + 1 < len(ms) else len(e)].strip())
    return out


def verdict(seg):
    s = re.sub(r"^\S+\s*", "", seg).lower()
    if re.match(r"(да|верно|правильно)\b", s):
        return True
    if re.match(r"(нет|неверно|не верно|неправильно)\b", s):
        return False
    return None


def stem(t):
    m = re.search(r"(?:^|\n|\s)1\)", t)
    return norm(t[:m.start()] if m else t)


def words(s):
    return {w[:5] for w in re.findall(r"[а-яa-z]{4,}", norm(s))}


def good(frag, opt):
    """один пункт (не склейка) и говорит о том же варианте"""
    if re.search(r"\n\s*(\d{1,2}|[А-Д])\s*[.)]", frag):
        return False
    w = words(opt)
    return not w or len(w & words(frag)) / len(w) >= 0.5


def renum(s, key):
    return re.sub(r"^\S+?[.)]", key + ".", s, 1)


def fill_explanations(questions, extra):
    """задания без пояснения: собрать из пунктов других заданий или выбросить. extra — задания из tests.json"""
    src = [q for q in questions + extra if not q.get("part") and q.get("explanation") and q.get("answer")]
    idx = collections.defaultdict(list)
    for q in src:
        let, num = options(q["text"])
        a, st = re.sub(r"\D", "", q["answer"]), stem(q["text"])
        if is_match(q["text"]):
            if len(a) != len(let):
                continue
            sg = segs(q["explanation"], True)
            for i, L in enumerate(sorted(let)):
                tgt, s = num.get(a[i]), sg.get(L)
                if tgt and s and tgt[:25] in norm(s):  # пункт называет тот же элемент второго столбца
                    idx[(q["n"], "m", let[L], tgt)].append((s, st))
        else:
            sg = segs(q["explanation"], False)
            for k, txt in num.items():
                s = sg.get(k)
                v = verdict(s) if s else None
                if v is not None and v == (k in a):  # пункт, спорящий с ключом своего задания, не берём
                    idx[(q["n"], "c", txt, v)].append((s, st))

    out, filled, dropped = [], 0, 0
    for q in questions:
        if q.get("part") or q.get("explanation"):
            out.append(q)
            continue
        let, num = options(q["text"])
        a, st, parts = re.sub(r"\D", "", q["answer"]), stem(q["text"]), []
        if is_match(q["text"]):
            ok = bool(let) and len(a) == len(let)
            for i, L in enumerate(sorted(let) if ok else []):
                tgt = num.get(a[i])
                c = [re.sub(r"([–—-]\s*)\d{1,2}\s*[.)]", lambda m: m.group(1) + a[i] + ".", renum(f, L), 1)
                     for f, _ in idx.get((q["n"], "m", let[L], tgt), []) if good(f, let[L])]
                c = [f for f in c if tgt and re.search(a[i] + r"[.)]\s*" + re.escape(tgt[:15]), norm(f))]  # номер столбца — этого задания
                if not c:
                    ok = False
                    break
                parts.append(c[0])
        else:
            ok = len(num) >= 3
            for k in sorted(num, key=int) if ok else []:
                c = [f for f, fs in idx.get((q["n"], "c", num[k], k in a), []) if good(f, num[k])
                     and (len(num[k]) >= 60 or difflib.SequenceMatcher(None, st, fs).ratio() >= 0.85)]
                if not c:
                    ok = False
                    break
                parts.append(renum(c[0], k))
        if ok:
            out.append({**q, "explanation": "\n\n".join(parts)})
            filled += 1
        else:
            dropped += 1
    print(f"Часть 1 без пояснения: собрано из других заданий {filled}, убрано {dropped}")
    return out


def build(paths):
    topics, questions, skipped = [], [], []
    for path in paths:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            read_sheet(ws, topics, questions, skipped)
    tests = json.loads((ROOT / "tests.json").read_text(encoding="utf-8"))
    questions = fill_explanations(questions, [q for t in tests for q in t["questions"]])
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
    print(f"Пропущено строк (нет номера, ответа, пояснения части 2): {len(skipped)}")


if __name__ == "__main__":
    main(sys.argv[1:] or ["Первая часть.xlsx", "Вторая часть.xlsx"])
