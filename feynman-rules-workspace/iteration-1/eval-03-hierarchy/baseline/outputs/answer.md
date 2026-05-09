# Typical Python Project Layout

A well-organized Python project typically uses the `src/` layout (which separates source code from tests and tooling), along with dedicated directories for tests, documentation, and configuration. Here's what a typical structure looks like:

```
my-project/
├── src/
│   └── my_package/
│       ├── __init__.py
│       ├── __main__.py
│       ├── core.py
│       ├── cli.py
│       ├── models/
│       │   ├── __init__.py
│       │   ├── user.py
│       │   └── product.py
│       ├── services/
│       │   ├── __init__.py
│       │   ├── auth.py
│       │   └── database.py
│       └── utils/
│           ├── __init__.py
│           ├── helpers.py
│           └── validators.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── unit/
│   │   ├── __init__.py
│   │   ├── test_core.py
│   │   ├── test_models.py
│   │   └── test_utils.py
│   ├── integration/
│   │   ├── __init__.py
│   │   ├── test_database.py
│   │   └── test_api.py
│   └── fixtures/
│       ├── sample_data.json
│       └── mock_responses.yaml
├── docs/
│   ├── index.md
│   ├── conf.py
│   ├── installation.md
│   ├── quickstart.md
│   ├── api/
│   │   ├── core.md
│   │   ├── models.md
│   │   └── services.md
│   ├── guides/
│   │   ├── getting-started.md
│   │   ├── configuration.md
│   │   └── deployment.md
│   └── _static/
│       └── logo.png
├── config/
│   ├── default.yaml
│   ├── development.yaml
│   ├── production.yaml
│   ├── staging.yaml
│   └── logging.yaml
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── pyproject.toml
├── setup.cfg
├── README.md
├── LICENSE
├── .gitignore
├── .pre-commit-config.yaml
└── requirements-dev.txt
```

## What each directory does

### `src/my_package/`
Holds the actual importable Python package. The `src/` layout prevents accidental imports from the project root and forces you to install the package (e.g., `pip install -e .`) before tests can find it — which catches packaging bugs early.

- `__init__.py` — marks the directory as a package; often exposes the public API
- `__main__.py` — entry point for `python -m my_package`
- `cli.py` — command-line interface (often using `click` or `argparse`)
- Sub-packages like `models/`, `services/`, `utils/` group related modules

### `tests/`
Mirrors the structure of `src/` so tests are easy to locate.

- `conftest.py` — shared `pytest` fixtures and plugins
- `unit/` — fast, isolated tests for individual functions/classes
- `integration/` — tests that exercise multiple components or external systems
- `fixtures/` — static test data (JSON, YAML, CSV)

### `docs/`
Documentation source files, typically built with Sphinx or MkDocs.

- `conf.py` — Sphinx configuration (or `mkdocs.yml` at the project root for MkDocs)
- `api/` — auto-generated or hand-written API reference pages
- `guides/` — narrative tutorials and how-to documents
- `_static/` — images, diagrams, custom CSS

### `config/`
Environment-specific configuration files, kept separate from code so they can be edited without code changes.

- `default.yaml` — base values shared across environments
- `development.yaml` / `staging.yaml` / `production.yaml` — per-environment overrides
- `logging.yaml` — structured logging configuration

### Top-level files
- `pyproject.toml` — modern, single source of truth for build system, dependencies, and tool config (Black, Ruff, pytest, mypy)
- `setup.cfg` — legacy metadata file, still used by some tools
- `.pre-commit-config.yaml` — git hooks for linting/formatting before commit
- `requirements-dev.txt` — pinned development dependencies (when not using Poetry/PDM)

This layout scales from a small library to a medium-sized application without needing significant restructuring, and it plays well with standard Python tooling (pytest, Sphinx, build, twine).
