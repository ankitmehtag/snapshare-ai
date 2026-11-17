"""Search/index scopes. A scope is built only by the orchestrator from server-verified
state (a gallery token or album membership) and arrives signed (AI_ARCHITECTURE §10)."""

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from pydantic.alias_generators import to_camel

# Mongo ObjectIds and similar opaque ids. The narrow charset also keeps the canonical
# JSON used for signing identical between Python and Node.
Id = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{1,64}$")]

MAX_ALBUMS_PER_SCOPE = 200


class Scope(BaseModel):
    model_config = ConfigDict(
        extra="forbid", frozen=True, alias_generator=to_camel, populate_by_name=True
    )

    scope_type: Literal["studio", "personal"]
    scope_id: Id
    event_id: Id | None = None
    personal_album_ids: tuple[Id, ...] | None = Field(
        default=None, min_length=1, max_length=MAX_ALBUMS_PER_SCOPE
    )

    @model_validator(mode="after")
    def _narrowed(self) -> Self:
        # A scope is never just a tenant: it always narrows to one event or a set of albums.
        if self.scope_type == "studio" and (self.event_id is None or self.personal_album_ids):
            raise ValueError("studio scope needs eventId and no personalAlbumIds")
        if self.scope_type == "personal" and (self.personal_album_ids is None or self.event_id):
            raise ValueError("personal scope needs personalAlbumIds and no eventId")
        return self

    def canonical(self) -> dict[str, object]:
        """The exact object that is signed: camelCase keys, unset fields omitted."""
        data = self.model_dump(by_alias=True, exclude_none=True)
        if "personalAlbumIds" in data:
            data["personalAlbumIds"] = list(data["personalAlbumIds"])
        return data
