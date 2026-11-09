"""Verificador das etapas da Trilha de Revisão: esquema, variedade de tipos, equilíbrio C/E e limpeza.

Uso: python -I ferramentas/validar_etapas.py <pasta> <RC_01> [<SP_02> ...]   |   --autoteste
Sai 0 só se cada etapa tiver 10–12 questões, ≥4 tipos, exatamente 1 caso (o último), C/E com 35–65% de E,
alternativas/opções/pares nas quantidades certas, comentário e base em toda questão, e nada proibido.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

CPF = re.compile(r"\d{3}\.\d{3}\.\d{3}-\d{2}")
# Nomes de material/curso de terceiro: guardados só como impressão digital (sha256, 16 primeiros dígitos) para que o
# nome não apareça neste repositório público; cada palavra do texto é comparada pela mesma impressão.
PROIBIDOS_HASH = {"07d79c82c2d616a9", "3dc800bb60beda91", "85608be2e9ed8e77", "fd83b39b96e35228"}


def _proibido(texto: str) -> str | None:
    import hashlib
    for w in set(re.findall(r"\w+", texto.lower())):
        if hashlib.sha256(w.encode()).hexdigest()[:16] in PROIBIDOS_HASH:
            return w
    return None
TIPOS = {"ce", "me", "lacuna", "associar", "caso"}


def validar(e: dict) -> list[str]:
    erros: list[str] = []
    for k in ("trilha", "n", "titulo", "objetivo", "relampago", "questoes"):
        if not e.get(k):
            erros.append(f"falta {k}")
    rel = e.get("relampago") or []
    if not 4 <= len(rel) <= 7:
        erros.append(f"relampago com {len(rel)} frases (4 a 7)")
    qs = e.get("questoes") or []
    if not 10 <= len(qs) <= 12:
        erros.append(f"{len(qs)} questões (10 a 12)")
    tipos = [q.get("tipo") for q in qs]
    if len(set(tipos) & TIPOS) < 4:
        erros.append(f"só {len(set(tipos))} tipos (mínimo 4)")
    if tipos.count("caso") != 1 or (tipos and tipos[-1] != "caso"):
        erros.append("precisa de exatamente 1 caso, na última posição")
    ces = [q for q in qs if q.get("tipo") == "ce"]
    if ces:
        pe = sum(q.get("gabarito") == "E" for q in ces) / len(ces)
        if len(ces) >= 3 and not 0.35 <= pe <= 0.65:
            erros.append(f"C/E com {pe:.0%} de E (35% a 65%)")
    vistos = set()
    for i, q in enumerate(qs, 1):
        t = q.get("tipo")
        p = f"q{i} ({t})"
        if t not in TIPOS:
            erros.append(f"{p}: tipo desconhecido")
            continue
        if len(str(q.get("enunciado", ""))) < 25:
            erros.append(f"{p}: enunciado curto")
        if not q.get("base"):
            erros.append(f"{p}: sem base")
        chave = re.sub(r"\W+", "", str(q.get("enunciado", "")).lower())
        if chave in vistos:
            erros.append(f"{p}: enunciado repetido")
        vistos.add(chave)
        if t != "caso" and len(str(q.get("comentario", ""))) < 80:
            erros.append(f"{p}: comentário curto (mínimo 80 caracteres)")
        if t == "ce" and q.get("gabarito") not in ("C", "E"):
            erros.append(f"{p}: gabarito C/E inválido")
        if t == "me":
            alt = q.get("alternativas") or []
            if len(alt) != 5 or len(set(alt)) != 5:
                erros.append(f"{p}: precisa de 5 alternativas distintas")
            if not isinstance(q.get("correta"), int) or not 0 <= q["correta"] < 5:
                erros.append(f"{p}: índice correta inválido")
        if t == "lacuna":
            op = q.get("opcoes") or []
            if "___" not in str(q.get("enunciado", "")):
                erros.append(f"{p}: lacuna sem ___")
            if len(op) != 4 or len(set(op)) != 4:
                erros.append(f"{p}: precisa de 4 opções distintas")
            if not isinstance(q.get("correta"), int) or not 0 <= q["correta"] < 4:
                erros.append(f"{p}: índice correta inválido")
        if t == "associar":
            pares = q.get("pares") or []
            if not 3 <= len(pares) <= 5 or any(len(x) != 2 for x in pares):
                erros.append(f"{p}: 3 a 5 pares de 2 itens")
            elif len({x[1] for x in pares}) != len(pares):
                erros.append(f"{p}: coluna B repetida")
        if t == "caso":
            if len(str(q.get("resposta", ""))) < 150:
                erros.append(f"{p}: resposta-modelo curta")
            if not q.get("pergunta"):
                erros.append(f"{p}: sem pergunta")
            if not 2 <= len(q.get("checklist") or []) <= 4:
                erros.append(f"{p}: checklist de 2 a 4 pontos")
    me = [q["correta"] for q in qs if q.get("tipo") == "me" and isinstance(q.get("correta"), int)]
    if len(me) >= 3 and len(set(me)) == 1:
        erros.append("múltipla escolha sempre com a correta na mesma posição")
    tudo = json.dumps(e, ensure_ascii=False)
    if CPF.search(tudo):
        erros.append("número em formato de CPF")
    w = _proibido(tudo)
    if w:
        erros.append(f"texto proibido: {w}")
    return erros


def autoteste() -> int:
    q_ce = [{"tipo": "ce", "enunciado": f"Afirmação de teste número {i} sobre responsabilidade.",
             "gabarito": "CE"[i % 2], "comentario": "x" * 90, "base": "CF"} for i in range(4)]
    q_me = [{"tipo": "me", "enunciado": f"Pergunta de múltipla escolha {i} para o teste.", "alternativas": list("ABCDE"),
             "correta": i, "comentario": "x" * 90, "base": "CF"} for i in range(3)]
    q_la = [{"tipo": "lacuna", "enunciado": "O Estado responde de forma ___ pelos danos.", "opcoes": list("wxyz"),
             "correta": 1, "comentario": "x" * 90, "base": "CF"}]
    q_as = [{"tipo": "associar", "enunciado": "Associe os temas às teses do STF.", "pares": [["a", "1"], ["b", "2"], ["c", "3"]],
             "comentario": "x" * 90, "base": "STF"}]
    q_ca = [{"tipo": "caso", "enunciado": "Situação concreta para o aluno resolver.", "pergunta": "Quem responde?",
             "resposta": "r" * 160, "checklist": ["a", "b"], "base": "CF"}]
    bom = {"trilha": "RC", "n": 1, "titulo": "T", "objetivo": "O", "relampago": list("abcd"),
           "questoes": q_ce + q_me + q_la + q_as + q_ca}
    casos = [("passa a etapa boa", bom, None)]
    r = json.loads(json.dumps(bom)); r["questoes"] = q_ce + q_me + q_la + q_ca + q_as
    casos.append(("acusa caso fora do fim", r, "última posição"))
    r = json.loads(json.dumps(bom)); r["questoes"][0]["enunciado"] += " Material " + "Gabari" + "tei."  # montado: o nome não fica escrito
    casos.append(("acusa nome de material de terceiro", r, "proibido"))
    r = json.loads(json.dumps(bom)); r["questoes"][4]["alternativas"] = list("ABCD")
    casos.append(("acusa múltipla escolha com 4 alternativas", r, "5 alternativas"))
    r = json.loads(json.dumps(bom)); r["questoes"] = q_ce + q_ca
    casos.append(("acusa etapa curta e pouco variada", r, "questões"))
    falhas = 0
    for nome, e, espera in casos:
        er = validar(e)
        ok = (not er) if espera is None else any(espera in x for x in er)
        falhas += not ok
        print(f"  {'✅' if ok else '❌'} {nome}" + ("" if ok else f" — {er}"))
    return 1 if falhas else 0


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if "--autoteste" in sys.argv:
        return autoteste()
    pasta, rc = Path(sys.argv[1]), 0
    for nome in sys.argv[2:]:
        arq = pasta / f"{nome}.json"
        if not arq.exists():
            print(f"[ X ] {nome}: arquivo ausente")
            rc = 1
            continue
        er = validar(json.loads(arq.read_text(encoding="utf-8")))
        print(f"[{' X ' if er else 'OK '}] {nome}")
        for x in er:
            print("      ", x)
        rc |= bool(er)
    return rc


if __name__ == "__main__":
    sys.exit(main())
