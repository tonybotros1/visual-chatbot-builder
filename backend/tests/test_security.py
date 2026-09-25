from uuid import uuid4

from app.security import create_access_token, decode_access_token, hash_password, verify_password


def test_password_hash_and_token_round_trip() -> None:
    password_hash = hash_password("a-secure-password")
    user_id = uuid4()

    assert password_hash != "a-secure-password"
    assert verify_password("a-secure-password", password_hash)
    assert not verify_password("wrong-password", password_hash)
    assert decode_access_token(create_access_token(user_id)) == user_id

