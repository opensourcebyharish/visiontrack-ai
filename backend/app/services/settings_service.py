"""Persistence and validation of user-editable settings."""

from __future__ import annotations

from app.database.db import Database
from app.schemas.settings_models import UserSettings, UserSettingsUpdate

_SETTINGS_KEY = "user_settings"


class SettingsService:
    def __init__(self, db: Database) -> None:
        self.db = db

    def get(self) -> UserSettings:
        stored = self.db.all_settings().get(_SETTINGS_KEY)
        base = UserSettings()
        if not stored:
            return base
        try:
            return UserSettingsUpdate(**stored).merged_into(base)
        except Exception:
            # Corrupt/legacy stored settings fall back to defaults.
            return base

    def update(self, patch: UserSettingsUpdate) -> UserSettings:
        merged = patch.merged_into(self.get())
        self.db.set_setting(_SETTINGS_KEY, merged.model_dump())
        return merged

    def replace(self, settings: UserSettings) -> UserSettings:
        self.db.set_setting(_SETTINGS_KEY, settings.model_dump())
        return settings
