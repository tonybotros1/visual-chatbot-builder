from datetime import UTC, datetime

from app.engine.targeting import evaluate_targeting


def test_nested_targeting_groups_match_context() -> None:
    rules = {
        "match": {
            "combinator": "all",
            "conditions": [
                {"field": "url", "operator": "contains", "value": "/pricing"},
                {"field": "country", "operator": "in", "value": ["AE", "LB"]},
            ],
            "groups": [
                {
                    "combinator": "any",
                    "conditions": [
                        {"field": "device", "operator": "equals", "value": "mobile"},
                        {"field": "utm.source", "operator": "equals", "value": "newsletter"},
                    ],
                }
            ],
        }
    }
    result = evaluate_targeting(
        rules,
        {"url": "https://example.com/pricing", "country": "AE", "device": "desktop", "utm": {"source": "newsletter"}},
    )
    assert result.eligible is True


def test_targeting_honors_schedule_and_frequency() -> None:
    result = evaluate_targeting(
        {
            "schedule": {"starts_at": "2026-01-01T00:00:00Z", "ends_at": "2026-01-31T23:59:59Z"},
            "frequency": {"max_impressions": 2, "once_per_session": True},
        },
        {"impressions": 2, "shown_this_session": True},
        now=datetime(2026, 2, 1, tzinfo=UTC),
    )
    assert result.eligible is False
    assert set(result.reasons) == {
        "Deployment schedule has ended",
        "Impression limit reached",
        "Already shown in this session",
    }


def test_empty_targeting_rules_are_eligible() -> None:
    assert evaluate_targeting({}, {}).eligible is True
