from typing import Any

import pytest
from pydantic import ValidationError

from app.scope import Scope
from app.security import (
    InvalidScopeSignatureError,
    canonical_json,
    request_signature,
    scope_signature,
    verify_scope,
)

EVENT = {"scopeType": "studio", "scopeId": "tenantA", "eventId": "event1"}


@pytest.mark.parametrize(
    "data",
    [
        {"scopeType": "studio", "scopeId": "tenantA"},  # tenant-wide: never allowed
        {"scopeType": "personal", "scopeId": "u1"},
        {"scopeType": "personal", "scopeId": "u1", "personalAlbumIds": []},
        {"scopeType": "studio", "scopeId": "t", "eventId": "e", "personalAlbumIds": ["a"]},
        {"scopeType": "personal", "scopeId": "u", "eventId": "e", "personalAlbumIds": ["a"]},
        {"scopeType": "studio", "scopeId": "t", "eventId": "e", "extra": "x"},
        {"scopeType": "studio", "scopeId": "t' OR 1=1", "eventId": "e"},
        {"scopeType": "admin", "scopeId": "t", "eventId": "e"},
    ],
)
def test_scope_must_narrow_and_be_well_formed(data: dict[str, Any]) -> None:
    with pytest.raises(ValidationError):
        Scope.model_validate(data)


def test_scope_canonical_form_is_camel_case_without_nulls() -> None:
    assert Scope.model_validate(EVENT).canonical() == EVENT


def test_request_signatures_match_shared_vectors(vectors: dict[str, Any]) -> None:
    key = vectors["requestKey"].encode()
    for req in vectors["requests"]:
        sig = request_signature(
            key, req["timestamp"], req["method"], req["path"], req["body"].encode()
        )
        assert sig == req["signature"]


def test_scope_signatures_match_shared_vectors(vectors: dict[str, Any]) -> None:
    key = vectors["scopeKey"].encode()
    for v in vectors["scopes"]:
        scope = Scope.model_validate(v["scope"])
        assert canonical_json(scope.canonical()).decode() == v["canonical"]
        assert verify_scope(key, scope, v["signature"]) == scope


def test_verify_scope_rejects_a_widened_or_retargeted_scope(vectors: dict[str, Any]) -> None:
    key = vectors["scopeKey"].encode()
    signed = vectors["scopes"][0]
    other_event = Scope.model_validate({**signed["scope"], "eventId": "someoneElsesEvent"})
    with pytest.raises(InvalidScopeSignatureError):
        verify_scope(key, other_event, signed["signature"])
    with pytest.raises(InvalidScopeSignatureError):
        verify_scope(b"wrong-key" * 4, Scope.model_validate(signed["scope"]), signed["signature"])


def test_scope_signature_depends_on_album_set() -> None:
    key = b"k" * 32
    a = Scope.model_validate({"scopeType": "personal", "scopeId": "u", "personalAlbumIds": ["a"]})
    ab = Scope.model_validate(
        {"scopeType": "personal", "scopeId": "u", "personalAlbumIds": ["a", "b"]}
    )
    assert scope_signature(key, a) != scope_signature(key, ab)
