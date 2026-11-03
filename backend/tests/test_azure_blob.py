import base64
import hashlib
import hmac

import pytest

from app.config import Settings
from app.engine.executor import EngineError
from app.services.azure_blob import (
    AzureBlobClient,
    AzureBlobConfig,
    config_from_connection,
    config_from_settings,
    parse_connection_string,
    shared_key_signature,
    string_to_sign,
)

KEY = base64.b64encode(b"0123456789abcdef0123456789abcdef").decode()


def test_connection_string_values_keep_their_equals_signs() -> None:
    parts = parse_connection_string(f"DefaultEndpointsProtocol=https;AccountName=acct;AccountKey={KEY};EndpointSuffix=core.windows.net")
    assert parts["AccountName"] == "acct"
    assert parts["AccountKey"] == KEY
    assert parts["EndpointSuffix"] == "core.windows.net"


def test_settings_without_azure_mean_local_storage() -> None:
    bare = Settings(_env_file=None, azure_storage_account_name="", azure_storage_account_key="", azure_storage_connection_string="")
    assert config_from_settings(bare) is None


def test_connection_string_wins_over_separate_values() -> None:
    settings = Settings(
        _env_file=None,
        azure_storage_account_name="other",
        azure_storage_account_key=KEY,
        azure_storage_connection_string=f"AccountName=Acct;AccountKey={KEY};EndpointSuffix=core.chinacloudapi.cn",
        azure_storage_container="My-Files",
    )
    config = config_from_settings(settings)
    assert config == AzureBlobConfig(account="acct", key=KEY, container="my-files", endpoint_suffix="core.chinacloudapi.cn")
    assert config.base_url == "https://acct.blob.core.chinacloudapi.cn"


def test_bad_names_are_rejected() -> None:
    with pytest.raises(EngineError):
        AzureBlobConfig(account="Bad Name", key=KEY).validate()
    with pytest.raises(EngineError):
        AzureBlobConfig(account="acct", key=KEY, container="UPPER").validate()
    with pytest.raises(EngineError):
        config_from_connection({"account": "acct"}, {})


def test_string_to_sign_matches_the_shared_key_layout() -> None:
    headers = {"x-ms-date": "Mon, 02 Nov 2026 10:00:00 GMT", "x-ms-version": "2023-11-03", "x-ms-blob-type": "BlockBlob", "Content-Type": "text/plain", "Content-Length": "5"}
    text = string_to_sign("PUT", "acct", "/files/a.txt", headers, {})
    lines = text.split("\n")
    assert lines[0] == "PUT"
    assert lines[3] == "5" and lines[5] == "text/plain"
    assert lines[12:] == ["x-ms-blob-type:BlockBlob", "x-ms-date:Mon, 02 Nov 2026 10:00:00 GMT", "x-ms-version:2023-11-03", "/acct/files/a.txt"]
    # A zero Content-Length is signed as an empty string, and query parameters follow the resource.
    text = string_to_sign("PUT", "acct", "/files", {"Content-Length": "0", "x-ms-date": "d", "x-ms-version": "v"}, {"restype": "container"})
    assert text.split("\n")[3] == ""
    assert text.endswith("/acct/files\nrestype:container")


def test_signature_is_hmac_sha256_of_the_decoded_key() -> None:
    expected = base64.b64encode(hmac.new(base64.b64decode(KEY), b"hello", hashlib.sha256).digest()).decode()
    assert shared_key_signature(KEY, "hello") == expected


def test_blob_paths_are_scoped_to_the_container() -> None:
    client = AzureBlobClient(AzureBlobConfig(account="acct", key=KEY, container="uploads"))
    assert client._blob_path("conv/abc-file name.pdf") == "/uploads/conv/abc-file%20name.pdf"
    with pytest.raises(EngineError):
        client._blob_path("../escape")
