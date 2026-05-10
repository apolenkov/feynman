A typical Python project layout looks like this:

```
my-project/
├── src/
│   ├── __init__.py
│   ├── main.py
│   └── utils.py
├── tests/
│   ├── __init__.py
│   ├── test_main.py
│   └── test_utils.py
├── docs/
│   ├── index.md
│   └── api.md
├── config/
│   ├── settings.yaml
│   └── logging.yaml
├── pyproject.toml
├── README.md
└── .gitignore
```

The `src/` directory holds the package source code. `tests/` mirrors the src structure for easy discovery. `docs/` contains Markdown or RST documentation. `config/` holds environment-specific configuration files. `pyproject.toml` (or `setup.py`) defines build metadata and dependencies.
