import pytest
from pydantic import SecretStr, ValidationError

from config import Config


def test_config_raises_when_bot_token_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(Config.model_config, "env_file", "/nonexistent/.env")
    monkeypatch.delenv("BOT_TOKEN", raising=False)
    monkeypatch.setenv("SERVER_ID", "123456789")
    with pytest.raises(ValidationError):
        Config()


def test_config_raises_when_server_id_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(Config.model_config, "env_file", "/nonexistent/.env")
    monkeypatch.setenv("BOT_TOKEN", "fake-token")
    monkeypatch.delenv("SERVER_ID", raising=False)
    with pytest.raises(ValidationError):
        Config()


def test_config_types(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BOT_TOKEN", "fake-token")
    monkeypatch.setenv("SERVER_ID", "123456789")
    cfg = Config()
    assert isinstance(cfg.BOT_TOKEN, SecretStr)
    assert isinstance(cfg.SERVER_ID, int)
    assert cfg.SERVER_ID == 123456789
