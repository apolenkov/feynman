A typical Python project layout:

```
my-project/
├── src/
│   ├── mypackage/
│   │   ├── __init__.py
│   │   ├── core.py
│   │   └── utils.py
│   └── main.py
├── tests/
│   ├── unit/
│   │   ├── test_core.py
│   │   └── test_utils.py
│   └── integration/
│       └── test_end_to_end.py
├── docs/
│   ├── index.md
│   ├── api-reference.md
│   └── getting-started.md
├── config/
│   ├── settings.yaml
│   ├── logging.yaml
│   └── .env.example
├── pyproject.toml
├── README.md
├── CHANGELOG.md
└── .gitignore
```

**Directory roles:**
- `src/` — importable package source; using `src/` layout prevents accidental import of local code during tests
- `tests/` — mirrors source structure; `unit/` for isolated function tests, `integration/` for multi-component flows
- `docs/` — markdown documentation; index + API reference are the minimum viable set
- `config/` — environment config; `.env.example` documents required environment variables without committing secrets
