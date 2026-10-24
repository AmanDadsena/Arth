"""Loads the real aws/sync_lambda.py with an in-memory DynamoDB table.

Tests then run the exact code the user deploys, so the backend's records and
the Lambda's checks can't drift apart.
"""

import importlib.util
import os
import sys
import types
from pathlib import Path

LAMBDA_PATH = Path(__file__).resolve().parents[2] / "aws" / "sync_lambda.py"
SECRET = "test-sync-secret-" + "x" * 24


class ClientError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class FakeTable:
    def __init__(self):
        self.items: dict[str, dict] = {}

    def put_item(self, Item, ConditionExpression, ExpressionAttributeNames):  # noqa: N803 (boto3's names)
        pk = Item[ExpressionAttributeNames["#pk"]]
        if pk in self.items:
            raise ClientError("ConditionalCheckFailedException")
        self.items[pk] = Item


def load(table: FakeTable, secret: str = SECRET):
    boto3 = types.ModuleType("boto3")
    boto3.resource = lambda name: types.SimpleNamespace(Table=lambda _name: table)
    botocore = types.ModuleType("botocore")
    exceptions = types.ModuleType("botocore.exceptions")
    exceptions.ClientError = ClientError
    saved = {k: sys.modules.get(k) for k in ("boto3", "botocore", "botocore.exceptions")}
    sys.modules.update({"boto3": boto3, "botocore": botocore, "botocore.exceptions": exceptions})
    old_secret = os.environ.get("SYNC_SECRET")
    os.environ["SYNC_SECRET"] = secret
    try:
        spec = importlib.util.spec_from_file_location("sync_lambda_under_test", LAMBDA_PATH)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v
        if old_secret is None:
            os.environ.pop("SYNC_SECRET", None)
        else:
            os.environ["SYNC_SECRET"] = old_secret


def event(body: str = "", method: str = "POST", secret: str | None = SECRET) -> dict:
    headers = {"content-type": "application/json"}
    if secret is not None:
        headers["X-Arth-Secret"] = secret
    return {"requestContext": {"http": {"method": method}}, "headers": headers,
            "body": body, "isBase64Encoded": False}
