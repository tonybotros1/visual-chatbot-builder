import pytest
from pydantic import ValidationError

from app.schemas.logic import ScenarioCreate


def test_expectation_accepts_known_fields() -> None:
    scenario = ScenarioCreate(name="Happy path", answers={"q1": "yes"}, expected={"status": "completed", "variables": {"q1": "yes"}})
    assert scenario.expected.model_dump(exclude_none=True) == {"status": "completed", "variables": {"q1": "yes"}}


def test_expectation_rejects_unknown_keys() -> None:
    with pytest.raises(ValidationError):
        ScenarioCreate(name="Typo", answers={}, expected={"variable": {"q1": "yes"}})
    with pytest.raises(ValidationError):
        ScenarioCreate(name="Flat", answers={}, expected={"q1": "yes"})


def test_expectation_rejects_unknown_status() -> None:
    with pytest.raises(ValidationError):
        ScenarioCreate(name="Status", answers={}, expected={"status": "finished"})
