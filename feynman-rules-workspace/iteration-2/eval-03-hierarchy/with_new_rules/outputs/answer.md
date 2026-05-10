```
my-project/
├── src/
│   ├── mypackage/
│   │   ├── __init__.py
│   │   └── core.py
│   └── main.py
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
│   └── index.md
├── config/
│   └── settings.yaml
└── pyproject.toml
```

`src/` holds the importable package — the `src/` layout prevents accidental import of local code during tests. `tests/` mirrors source structure. `docs/` carries Markdown documentation. `config/` holds environment-specific YAML and a `.env.example` for required secrets. `pyproject.toml` defines build metadata and dependencies.
