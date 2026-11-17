import pytest

from scripts.check_licenses import classify


@pytest.mark.parametrize(
    "text",
    [
        "MIT",
        "BSD-3-Clause",
        "Apache-2.0 AND BSD-2-Clause",
        "License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)",
        "PSF-2.0",
    ],
)
def test_permissive_licences_pass(text: str) -> None:
    assert classify(text)


@pytest.mark.parametrize(
    "text",
    [
        "GPL-3.0-or-later",
        "AGPL-3.0",
        "License :: OSI Approved :: GNU Lesser General Public License v3 (LGPLv3)",
        "MIT AND GPL-2.0",
        "CC-BY-NC-4.0",
        "Proprietary",
        "",
    ],
)
def test_copyleft_noncommercial_and_unknown_fail(text: str) -> None:
    assert not classify(text)
