# CLAUDE.md — Trilha de Revisão · Direito Administrativo (revisao-adm-pietro)

Regras da pasta-mãe valem aqui (`C:\Users\advpi\Repositório\CLAUDE.md` e o HARNESS). Isto é só o que é deste projeto.

- **O que é:** site estático para os alunos do titular revisarem Responsabilidade Civil do Estado e Serviços
  Públicos em etapas (relâmpago → C/E e lacuna → múltipla escolha e associação → caso), com meta de 70%.
- **Repositório:** `advpietromedeiros-sudo/revisao-adm-pietro`, **PÚBLICO** por decisão do titular (09/11/2026, D-001),
  publicado pelo GitHub Pages (ramo `main`, raiz).
- **Pilha:** HTML + JS sem dependências (`index.html` + `conteudo.js`); Python 3.11 nas ferramentas; teste no Chrome
  headless por CDP (Node 24+). ⚠️ Divergência da pilha fixa do roteiro (Next/React): registrada em D-002.
- **Conteúdo:** `conteudo/<RC|SP>_<NN>.json` (autoral) → `python -I ferramentas/montar.py` → `conteudo.js`.
- **Portão:** `python docs/verificar_antes_de_subir.py` (verificador de etapas, montagem, teste do app e autotestes).
- 🔴 **Nada de material de terceiro no repositório:** as aulas-fonte ficam em `.scratch/` (ignorado).
