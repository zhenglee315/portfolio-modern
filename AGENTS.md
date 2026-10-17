# UI conventions

- Prefer one-word table column headings where possible. Keep their meaning clear and honor labels explicitly specified by the user. This is a display-text convention; database columns and API field names do not need to be renamed to match.

# Backend startup

- Start or restart the backend from `backend/` with `uv run --locked manage.py` so FastAPI and APScheduler run together. `manage_fastapi.py` and `manage_apscheduler.py` are child entry points; use them to start a single service only when the user explicitly requests it.
