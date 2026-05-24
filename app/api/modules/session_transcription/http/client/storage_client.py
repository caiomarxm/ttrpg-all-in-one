from __future__ import annotations

from pathlib import Path

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from modules.session_transcription.config import SessionTranscriptionSettings


class StorageClient:
    def __init__(self, config: SessionTranscriptionSettings) -> None:
        self._bucket = config.STORAGE_BUCKET
        self._client = boto3.client(
            "s3",
            endpoint_url=config.STORAGE_ENDPOINT_URL,
            aws_access_key_id=config.STORAGE_ACCESS_KEY,
            aws_secret_access_key=config.STORAGE_SECRET_KEY,
            region_name=config.STORAGE_REGION,
            config=Config(signature_version="s3v4"),
        )
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        try:
            self._client.head_bucket(Bucket=self._bucket)
        except ClientError:
            self._client.create_bucket(Bucket=self._bucket)

    def upload_file(self, local_path: Path, object_key: str) -> str:
        self._client.upload_file(str(local_path), self._bucket, object_key)
        return object_key
