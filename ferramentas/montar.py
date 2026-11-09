"""Monta conteudo.js (window.TRILHAS) a partir de conteudo/<TRILHA>_<NN>.json.

Recusa gravar se alguma etapa reprovar no verificador (ferramentas/validar_etapas.py) ou se faltar etapa na
sequência de uma trilha.  Uso: python -I ferramentas/montar.py [pasta]   (padrão: conteudo)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
import validar_etapas as V  # noqa: E402

TRILHAS = {
    "RC": ("Responsabilidade Civil do Estado",
           "Da evolução das teorias ao filtro jurisprudencial: sujeitos, nexo, omissões, prescrição e Lei 14.133."),
    "SP": ("Serviços Públicos",
           "Conceito, classificações, princípios, delegação, tarifas, continuidade, extinção da concessão e PPP."),
}


def montar(pasta: Path) -> tuple[dict, list[str]]:
    erros: list[str] = []
    dados: dict = {}
    for arq in sorted(pasta.glob("*.json")):
        m = re.fullmatch(r"([A-Z]{2})_(\d{2})", arq.stem)
        if not m or m.group(1) not in TRILHAS:
            continue
        e = json.loads(arq.read_text(encoding="utf-8"))
        erros += [f"{arq.stem}: {x}" for x in V.validar(e)]
        if e.get("n") != int(m.group(2)) or e.get("trilha") != m.group(1):
            erros.append(f"{arq.stem}: trilha/n não batem com o nome do arquivo")
        k = m.group(1)
        dados.setdefault(k, {"nome": TRILHAS[k][0], "descricao": TRILHAS[k][1], "etapas": []})["etapas"].append(e)
    for k, d in dados.items():
        d["etapas"].sort(key=lambda e: e["n"])
        ns = [e["n"] for e in d["etapas"]]
        if ns != list(range(1, len(ns) + 1)):
            erros.append(f"{k}: etapas fora de sequência: {ns}")
    return dados, erros


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    pasta = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "conteudo"
    dados, erros = montar(pasta)
    if erros or not dados:
        print(f"  ❌ nada gravado: {len(erros)} problema(s)" + ("" if dados else " (nenhuma etapa)"))
        for x in erros[:30]:
            print("     ", x)
        return 1
    js = ("/* GERADO por ferramentas/montar.py a partir de conteudo/*.json — não edite à mão. */\n"
          "window.TRILHAS=" + json.dumps(dados, ensure_ascii=False, separators=(",", ":")) + ";\n")
    (RAIZ / "conteudo.js").write_text(js, encoding="utf-8", newline="\n")
    for k, d in dados.items():
        q = sum(len(e["questoes"]) for e in d["etapas"])
        print(f"  {k} {d['nome']}: {len(d['etapas'])} etapas, {q} questões")
    kb = f"{len(js.encode()) / 1024:.1f}".replace(".", ",")
    print(f"  ✅ gravado conteudo.js ({kb} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
