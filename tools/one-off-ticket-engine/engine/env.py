"""Minimal .env loader — never prints or logs any value it reads."""
import os
from .config import REPO_ROOT, API_KEY_ENV_VAR


def load_dotenv_if_present():
    env_path = REPO_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if key and key not in os.environ:
            os.environ[key] = value


def get_api_key() -> str:
    load_dotenv_if_present()
    key = os.environ.get(API_KEY_ENV_VAR)
    if not key:
        raise RuntimeError(
            f"{API_KEY_ENV_VAR} absent de l'environnement/.env — impossible d'appeler l'API. "
            "(convention reprise telle-quelle des scripts/*.js existants du repo)"
        )
    return key
