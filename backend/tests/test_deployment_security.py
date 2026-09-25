from fastapi import HTTPException
import pytest

from app.api.routes.deployments import _issue_eligibility_token, _verify_eligibility_token


def test_deployment_eligibility_token_is_bound_to_key() -> None:
    token = _issue_eligibility_token("deployment-one")

    _verify_eligibility_token(token, "deployment-one")

    with pytest.raises(HTTPException) as exc_info:
        _verify_eligibility_token(token, "deployment-two")
    assert exc_info.value.status_code == 403


def test_deployment_start_requires_an_eligibility_token() -> None:
    with pytest.raises(HTTPException) as exc_info:
        _verify_eligibility_token(None, "deployment-one")
    assert exc_info.value.status_code == 403
