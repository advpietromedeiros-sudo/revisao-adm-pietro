#!/usr/bin/env python3
"""Portão da Trilha de Revisão: roda as portas e só abre com todas verdes (porta pulada sai 2 e se diz).

Uso: python docs/verificar_antes_de_subir.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PORTAS: list[tuple[str, list[str], str]] = [
    ("o verificador de etapas acusa", [sys.executable, "-I", "ferramentas/validar_etapas.py", "--autoteste"],
     "etapa sem caso, com 4 alternativas ou com nome de material de terceiro passando calada"),
    ("conteudo.js montado e todas as etapas aprovadas", [sys.executable, "-I", "ferramentas/montar.py"],
     "site publicado com etapa reprovada, fora de sequência ou conteudo.js desatualizado"),
    ("conteudo.js igual ao montado (nada editado à mão)", ["git", "diff", "--exit-code", "--", "conteudo.js"],
     "conteudo.js editado à mão divergindo de conteudo/*.json"),
    ("o aplicativo: comportamento", ["node", "testes/testar_app.mjs"],
     "trava dos 70% quebrada, tipo de questão sem comentário, progresso perdido, tela larga no celular"),
    ("o teste do aplicativo acusa", ["node", "testes/testar_app.mjs", "--autoteste"],
     "teste que passa com o app estragado (verde falso)"),
    ("o conteúdo real roda inteiro no app", ["node", "testes/testar_app.mjs", "--real"],
     "questão real que trava a tela ou etapa que não chega ao resultado"),
]


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    falhas, puladas = [], []
    for nome, cmd, motivo in PORTAS:
        if cmd[0] == "node" and shutil.which("node") is None:
            puladas.append(nome)
            print(f"  [PUL] {nome} — Node ausente: pulada, e isto não é verde")
            continue
        r = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True, encoding="utf-8")
        if r.returncode == 0:
            print(f"  [OK ] {nome}")
        elif r.returncode == 2:
            puladas.append(nome)
            print(f"  [PUL] {nome} — pulada, e isto não é verde")
        else:
            falhas.append(nome)
            print(f"  [ X ] {nome}\n        impede: {motivo}")
            for linha in (r.stdout + r.stderr).strip().splitlines()[-10:]:
                print(f"        │ {linha}")
    print()
    if falhas:
        print(f"  ❌ portão FECHADO: {len(falhas)} falha(s)")
        return 1
    if puladas:
        print(f"  ⚠️ portão aberto com {len(puladas)} porta(s) pulada(s) — dizer quais no commit")
        return 0
    print(f"  ✅ portão aberto — {len(PORTAS)} portas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
