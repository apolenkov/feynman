# Typical Python Project Layout

A standard Python project organizes source code, tests, documentation, and configuration into dedicated top-level directories. The `src/` layout (preferred over flat layouts) prevents accidental imports from the project root and forces tests to run against the installed package.

## Directory Structure

```
my-python-project/
├── src/
│   └── my_package/
│       ├── __init__.py
│       ├── __main__.py
│       ├── core.py
│       ├── cli.py
│       ├── api/
│       │   ├── __init__.py
│       │   ├── routes.py
│       │   └── schemas.py
│       ├── models/
│       │   ├── __init__.py
│       │   ├── user.py
│       │   └── product.py
│       └── utils/
│           ├── __init__.py
│           ├── logging.py
│           └── helpers.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── unit/
│   │   ├── __init__.py
│   │   ├── test_core.py
│   │   ├── test_cli.py
│   │   └── test_helpers.py
│   ├── integration/
│   │   ├── __init__.py
│   │   ├── test_api.py
│   │   └── test_database.py
│   └── fixtures/
│       ├── sample_data.json
│       └── mock_responses.yaml
├── docs/
│   ├── index.md
│   ├── conf.py
│   ├── getting-started.md
│   ├── api/
│   │   ├── reference.md
│   │   └── examples.md
│   ├── guides/
│   │   ├── installation.md
│   │   ├── configuration.md
│   │   └── deployment.md
│   └── _static/
│       └── architecture.png
├── config/
│   ├── default.yaml
│   ├── development.yaml
│   ├── production.yaml
│   ├── logging.yaml
│   └── secrets.example.env
├── pyproject.toml
├── README.md
├── LICENSE
└── .gitignore
```

## What each top-level directory holds

```
src/    | tests/   | docs/    | config/
--------|----------|----------|----------
package | pytest   | sphinx   | env yaml
modules | fixtures | guides   | secrets
cli     | conftest | api ref  | logging
```

- `src/my_package/` — importable package; `__init__.py` declares the package and `__main__.py` enables `python -m my_package`.
- `tests/` — mirrors `src/` structure; `conftest.py` holds shared pytest fixtures; split by `unit/` and `integration/`.
- `docs/` — Sphinx or MkDocs source; `conf.py` configures the build; `_static/` holds images and assets.
- `config/` — environment-specific YAML files; `secrets.example.env` is committed as a template, real `.env` is gitignored.

## Why the src/ layout

Without `src/`, Python adds the project root to `sys.path`, so `import my_package` works even if the package is broken or uninstalled. With `src/`, you must `pip install -e .` first, which catches missing `__init__.py` files, broken entry points, and packaging bugs before they reach users.
