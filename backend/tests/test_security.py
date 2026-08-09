import pytest

from app.config import Settings, validate_security_settings


@pytest.mark.parametrize(
    "token",
    ["", "change-me", "change-me-to-a-long-random-value", "__GENERATE__", "short"],
)
def test_production_rejects_missing_or_placeholder_setup_access_token(token):
    with pytest.raises(RuntimeError, match="SETUP_ACCESS_TOKEN"):
        validate_security_settings(Settings(app_env="production", setup_access_token=token))


def test_production_accepts_strong_setup_access_token():
    validate_security_settings(Settings(app_env="production", setup_access_token="a" * 64))


def test_development_can_run_without_setup_access_token():
    validate_security_settings(Settings(app_env="development", setup_access_token=""))
