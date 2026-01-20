from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Mapping
from urllib.parse import parse_qsl

logger = logging.getLogger("qr_scanner.auth")


@dataclass(frozen=True)
class InitDataValidationError(Exception):
    message: str
    status_code: int = 403


def _parse_init_data(init_data: str) -> dict[str, str]:
    return dict(parse_qsl(init_data, keep_blank_values=True))


def _normalize_value(value: Any) -> str:
    if isinstance(value, (dict, list)):
        return json.dumps(value, separators=(",", ":"), ensure_ascii=False)
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return ""
    return str(value)


def _build_data_check_string(fields: Mapping[str, Any]) -> str:
    pairs = []
    for key in sorted(fields.keys()):
        if key == "hash":
            continue
        pairs.append(f"{key}={_normalize_value(fields[key])}")
    return "\n".join(pairs)


def _compute_hash_webapp(data_check_string: str, bot_token: str) -> str:
    secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
    return hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()


def _compute_hash_legacy(data_check_string: str, bot_token: str) -> str:
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    return hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()


def validate_init_data(init_data: str, bot_token: str) -> dict[str, str]:
    if not init_data:
        raise InitDataValidationError("Missing initData", status_code=401)
    fields = _parse_init_data(init_data)
    if "hash" not in fields:
        raise InitDataValidationError("Missing initData hash", status_code=401)

    data_check_string = _build_data_check_string(fields)
    expected_hash = _compute_hash_webapp(data_check_string, bot_token)
    if not hmac.compare_digest(expected_hash, fields["hash"]):
        legacy_hash = _compute_hash_legacy(data_check_string, bot_token)
        if hmac.compare_digest(legacy_hash, fields["hash"]):
            logger.warning("InitData validated with legacy hash algorithm")
            return fields
        if os.getenv("DEBUG_LOG_INIT_HASH") == "1":
            logger.warning("DEBUG init_data_check_string=%s", data_check_string)
            logger.warning("DEBUG init_data_expected_hash=%s", expected_hash)
            logger.warning("DEBUG init_data_expected_hash_legacy=%s", legacy_hash)
            logger.warning("DEBUG init_data_received_hash=%s", fields.get("hash"))
            logger.warning("DEBUG init_data_fields=%s", fields)
        raise InitDataValidationError("Invalid initData hash", status_code=403)

    return fields


def validate_init_data_unsafe(init_data_unsafe: Mapping[str, Any], bot_token: str) -> Mapping[str, Any]:
    if not init_data_unsafe:
        raise InitDataValidationError("Missing initData", status_code=401)
    if "hash" not in init_data_unsafe:
        raise InitDataValidationError("Missing initData hash", status_code=401)

    data_check_string = _build_data_check_string(init_data_unsafe)
    expected_hash = _compute_hash_webapp(data_check_string, bot_token)
    if not hmac.compare_digest(expected_hash, str(init_data_unsafe["hash"])):
        legacy_hash = _compute_hash_legacy(data_check_string, bot_token)
        if hmac.compare_digest(legacy_hash, str(init_data_unsafe["hash"])):
            logger.warning("InitData (unsafe) validated with legacy hash algorithm")
            return init_data_unsafe
        if os.getenv("DEBUG_LOG_INIT_HASH") == "1":
            logger.warning("DEBUG init_data_unsafe_check_string=%s", data_check_string)
            logger.warning("DEBUG init_data_unsafe_expected_hash=%s", expected_hash)
            logger.warning("DEBUG init_data_unsafe_expected_hash_legacy=%s", legacy_hash)
            logger.warning("DEBUG init_data_unsafe_received_hash=%s", init_data_unsafe.get("hash"))
            logger.warning("DEBUG init_data_unsafe_fields=%s", init_data_unsafe)
        raise InitDataValidationError("Invalid initData hash", status_code=403)

    return init_data_unsafe


def extract_user_id(init_fields: Mapping[str, Any]) -> int:
    user_value = init_fields.get("user")
    if user_value is None:
        raise InitDataValidationError("Missing user data", status_code=401)

    if isinstance(user_value, str):
        try:
            user_data = json.loads(user_value)
        except json.JSONDecodeError as exc:
            raise InitDataValidationError("Invalid user payload", status_code=403) from exc
    elif isinstance(user_value, Mapping):
        user_data = user_value
    else:
        raise InitDataValidationError("Invalid user payload", status_code=403)

    user_id = user_data.get("id")
    if not user_id:
        raise InitDataValidationError("Missing user id", status_code=401)

    return int(user_id)
