"""소스코드의 import, 호출, endpoint 관계를 읽어 .cluedoc/graph/ 에 Obsidian 노트를 생성합니다.

실행: python scripts/codegraph.py            (저장소 루트. 호스트에 Python 이 없으면
      docker compose run --rm --no-deps dev python scripts/codegraph.py)
옵션: --check  생성 결과가 저장된 노트와 다르면 종료 코드 1 을 반환합니다(pre-commit 용).

노트 1개 = 파일 1개. 경로는 graph/<저장소 경로>.md 이고 확장자는 제거합니다(app.py 는 app.md).
디렉토리마다 <디렉토리>/<디렉토리 이름>.md 목차 노트를 둡니다. paper 의 frontmatter sources 는
"[[graph/…]]" 링크로 치환해 Obsidian 그래프에서 paper 와 코드가 이어지게 합니다.
표준 라이브러리만 씁니다.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GRAPH = ROOT / ".cluedoc" / "graph"
PAPERS = ROOT / ".cluedoc"

PY_ROOTS = [ROOT / "backend" / "src", ROOT / "backend" / "tests", ROOT / "backend" / "migrations"]
TS_ROOTS = [ROOT / "frontend" / "src", ROOT / "frontend" / "e2e"]
SKIP_DIRS = {"__pycache__", "node_modules", "dist", ".git", "trash"}

TS_IMPORT = re.compile(r"""(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)""")
ROUTE_METHODS = {"get", "post", "put", "patch", "delete"}


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def note_id(src: str) -> str:
    """저장소 경로를 graph 안의 노트 id(확장자 제거)로 바꿉니다. 'backend/src/backend/api/app.py' 는 'backend/src/backend/api/app' 입니다."""
    p = Path(src)
    if p.suffix in {".py", ".ts", ".tsx"}:
        return (p.parent / p.stem).as_posix()
    return src  # 설정 파일은 확장자를 남겨 이름 충돌을 피합니다


# ── 서버(Python) ─────────────────────────────────────────────────────────────

def py_module_name(path: Path) -> str | None:
    """backend/src/backend/api/app.py 는 backend.api.app 입니다. tests 와 migrations 는 module 이름이 없습니다."""
    try:
        parts = path.relative_to(ROOT / "backend" / "src").with_suffix("").parts
    except ValueError:
        return None
    return ".".join(parts[:-1] if parts[-1] == "__init__" else parts)


def py_analyze(path: Path, module_of: dict[str, str]) -> dict:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imports: set[str] = set()
    alias_to_module: dict[str, str] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("backend"):
            if node.module in module_of:
                imports.add(module_of[node.module])
                for a in node.names:
                    alias_to_module[a.asname or a.name] = node.module
            for a in node.names:  # from backend.services.period import pipeline 형태
                sub = f"{node.module}.{a.name}"
                if sub in module_of:
                    imports.add(module_of[sub])
                    alias_to_module[a.asname or a.name] = sub
        elif isinstance(node, ast.Import):
            for a in node.names:
                if a.name in module_of:
                    imports.add(module_of[a.name])
                    alias_to_module[(a.asname or a.name).split(".")[0]] = a.name

    functions: list[dict] = []
    endpoints: list[dict] = []
    for node in tree.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        calls: set[str] = set()
        for sub in ast.walk(node):
            if isinstance(sub, ast.Call):
                target = sub.func
                name = target.attr if isinstance(target, ast.Attribute) else getattr(target, "id", None)
                base = target.value.id if isinstance(target, ast.Attribute) and isinstance(target.value, ast.Name) else None
                owner = alias_to_module.get(base) if base else alias_to_module.get(name)
                if owner and name:
                    calls.add(f"{owner}.{name}" if base else owner)
        functions.append({"name": node.name, "calls": sorted(calls)})
        for dec in node.decorator_list:
            if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute) and dec.func.attr in ROUTE_METHODS and dec.args:
                route = dec.args[0]
                if isinstance(route, ast.Constant):
                    endpoints.append({"method": dec.func.attr.upper(), "path": route.value, "handler": node.name})
    return {"imports": sorted(imports), "functions": functions, "endpoints": endpoints}


# ── 화면(TypeScript) ──────────────────────────────────────────────────────────

def ts_resolve(from_file: Path, spec: str, known: set[str]) -> str | None:
    if not spec.startswith("."):
        return None
    base = (from_file.parent / spec).resolve()
    for cand in [base, *(base.with_suffix(s) for s in (".ts", ".tsx")), base / "index.ts", base / "index.tsx"]:
        try:
            r = rel(cand)
        except ValueError:
            continue
        if r in known:
            return r
    return None


def ts_analyze(path: Path, known: set[str]) -> dict:
    text = path.read_text(encoding="utf-8")
    imports = set()
    for m in TS_IMPORT.finditer(text):
        spec = m.group(1) or m.group(2)
        target = ts_resolve(path, spec, known)
        if target:
            imports.add(target)
    return {"imports": sorted(imports), "functions": [], "endpoints": []}


# ── 노트 생성 ─────────────────────────────────────────────────────────────────

def link(src: str, label: str | None = None) -> str:
    nid = note_id(src)
    return f"[[graph/{nid}|{label or Path(src).name}]]"


def render_file(src: str, info: dict, imported_by: list[str]) -> str:
    lines = ["---", f"source: {src}", "kind: file", "---", "", f"# {Path(src).name}", "",
             f"저장소 경로 `{src}` 의 관계 노트입니다. `scripts/codegraph.py` 가 생성하므로 직접 수정하지 않습니다.", ""]
    if info["imports"] or imported_by:
        # mermaid 노드 id 는 경로 전체로 만들어 같은 파일 이름(pipeline.py 등)이 합쳐지지 않게 합니다.
        nid = lambda s: re.sub(r"[^A-Za-z0-9_]", "_", note_id(s))
        lines += ["```mermaid", "flowchart LR", f'  {nid(src)}["{Path(src).name}"]']
        for i in info["imports"]:
            lines.append(f'  {nid(src)} --> {nid(i)}["{Path(i).name}"]')
        for i in imported_by:
            lines.append(f'  {nid(i)}["{Path(i).name}"] --> {nid(src)}')
        lines += ["```", ""]
    lines += ["## imports", ""] + ([f"- {link(i)}" for i in info["imports"]] or ["- 없음"]) + [""]
    lines += ["## imported by", ""] + ([f"- {link(i)}" for i in imported_by] or ["- 없음"]) + [""]
    if info["endpoints"]:
        lines += ["## endpoint", "", "| method | path | handler |", "|---|---|---|"]
        lines += [f"| {e['method']} | `{e['path']}` | `{e['handler']}` |" for e in info["endpoints"]] + [""]
    if info["functions"]:
        lines += ["## 함수와 호출", ""]
        for f in info["functions"]:
            lines.append(f"- `{f['name']}`" + (": " + ", ".join(f"`{c}`" for c in f["calls"]) if f["calls"] else ""))
        lines.append("")
    return "\n".join(lines)


def render_dir(d: str, children: list[str], subdirs: list[str]) -> str:
    name = Path(d).name or "root"
    lines = ["---", f"source: {d}/", "kind: directory", "---", "", f"# {name}/", ""]
    lines += [f"- {link(c)}" for c in children]
    lines += [f"- [[graph/{s}/{Path(s).name}|{Path(s).name}/]]" for s in subdirs]
    return "\n".join(lines) + "\n"


def collect_sources() -> tuple[list[Path], list[Path]]:
    def walk(roots: list[Path], exts: set[str]) -> list[Path]:
        out = []
        for r in roots:
            for p in r.rglob("*"):
                if p.suffix in exts and not (SKIP_DIRS & set(p.parts)):
                    if p.name == "__init__.py" and not p.read_text(encoding="utf-8").strip():
                        continue  # 비어 있는 패키지 표시 파일은 노트를 만들지 않습니다
                    out.append(p)
        return sorted(out)
    return walk(PY_ROOTS, {".py"}), walk(TS_ROOTS, {".ts", ".tsx"})


def paper_sources() -> set[str]:
    """paper frontmatter 의 sources 경로(설정 파일 포함)를 모읍니다."""
    found = set()
    for paper in PAPERS.rglob("*.md"):
        if GRAPH in paper.parents:
            continue
        head = paper.read_text(encoding="utf-8").partition("\n---")[0]
        for line in head.splitlines():
            m = re.match(r"\s+-\s+(?:\"\[\[graph/[^\]|]+\]\]\"\s*#.*?[—(]\s*)?([A-Za-z0-9_./-]+)", line)
            if m and (ROOT / m.group(1).rstrip("/")).exists():
                found.add(m.group(1))
    return found


def build() -> dict[str, str]:
    py_files, ts_files = collect_sources()
    module_of = {}
    for p in py_files:
        m = py_module_name(p)
        if m:
            module_of[m] = rel(p)
    known_ts = {rel(p) for p in ts_files}

    info: dict[str, dict] = {}
    for p in py_files:
        info[rel(p)] = py_analyze(p, module_of)
    for p in ts_files:
        info[rel(p)] = ts_analyze(p, known_ts)
    for extra in paper_sources():
        if extra.endswith("/"):
            continue
        info.setdefault(extra, {"imports": [], "functions": [], "endpoints": []})

    imported_by: dict[str, list[str]] = {s: [] for s in info}
    for s, i in info.items():
        for t in i["imports"]:
            imported_by.setdefault(t, []).append(s)

    notes: dict[str, str] = {}
    dirs: dict[str, tuple[set[str], set[str]]] = {}
    for s in info:
        notes[f"{note_id(s)}.md"] = render_file(s, info[s], sorted(imported_by.get(s, [])))
        d = Path(s).parent.as_posix()
        dirs.setdefault(d, (set(), set()))[0].add(s)
        while d not in ("", "."):
            parent = Path(d).parent.as_posix()
            if parent in ("", "."):
                break
            dirs.setdefault(parent, (set(), set()))[1].add(d)
            d = parent
    for d, (children, subdirs) in dirs.items():
        if d in ("", "."):
            continue
        notes[f"{d}/{Path(d).name}.md"] = render_dir(d, sorted(children), sorted(subdirs))
    return notes


def rewrite_paper_sources() -> int:
    """paper frontmatter 의 `- 경로   # 설명` 을 `- "[[graph/…]]"  # 설명 — 경로` 로 바꿉니다."""
    changed = 0
    for paper in PAPERS.rglob("*.md"):
        if GRAPH in paper.parents:
            continue
        text = paper.read_text(encoding="utf-8")
        head, sep, body = text.partition("\n---")
        if not sep:
            continue
        new_lines = []
        for line in head.splitlines():
            m = re.match(r"^(\s+-\s+)([A-Za-z0-9_./-]+)(\s*)(#.*)?$", line)
            if m and (ROOT / m.group(2).rstrip("/")).exists():
                src = m.group(2)
                nid = f"{src.rstrip('/')}/{Path(src.rstrip('/')).name}" if src.endswith("/") else note_id(src)
                comment = (m.group(4) or "#").rstrip()
                line = f'{m.group(1)}"[[graph/{nid}]]"  {comment} — {src}' if comment != "#" else f'{m.group(1)}"[[graph/{nid}]]"  # {src}'
            new_lines.append(line)
        new_head = "\n".join(new_lines)
        if new_head != head:
            paper.write_text(new_head + sep + body, encoding="utf-8", newline="")
            changed += 1
    return changed


def main() -> int:
    check = "--check" in sys.argv
    # paper sources 치환을 먼저 해야 build 가 읽는 경로 집합이 최종 상태와 같습니다.
    papers = 0 if check else rewrite_paper_sources()
    notes = build()
    stale = []
    for name, content in notes.items():
        target = GRAPH / name
        if target.exists() and target.read_text(encoding="utf-8") == content:
            continue
        stale.append(name)
        if not check:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8", newline="")
    removed = [p for p in GRAPH.rglob("*.md") if p.relative_to(GRAPH).as_posix() not in notes] if GRAPH.exists() else []
    if check:
        if stale or removed:
            print(f"codegraph: 노트 {len(stale)}개가 소스와 다릅니다. python scripts/codegraph.py 를 실행하십시오.")
            return 1
        print("codegraph: 최신입니다.")
        return 0
    for p in removed:
        p.unlink()
    print(f"codegraph: 노트 {len(notes)}개 (갱신 {len(stale)}, 삭제 {len(removed)}), paper sources 치환 {papers}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
