"""One-time model provisioning into HF_HOME (/models).

The running service is offline (`HF_HUB_OFFLINE=1`) so it never downloads during
a request. To use the Laya backend, download the checkpoint once:

    pnpm ai:provision
    # equivalent, with downloads temporarily enabled:
    docker compose --profile ai run --rm \
      -e HF_HUB_OFFLINE=0 -e TRANSFORMERS_OFFLINE=0 \
      ai python -m app.provision

Requires the image to have been built with `AI_INSTALL_MODELS=1`.
"""
from __future__ import annotations

import os
import sys

from .config import Settings


def main() -> int:
    settings = Settings.from_env()
    if settings.classifier_backend != "laya":
        print(f"AI_CLASSIFIER_BACKEND={settings.classifier_backend!r}: nothing to provision.")
        print("Uncomment the Laya preset in .env, rebuild with AI_INSTALL_MODELS=1, then re-run.")
        return 0

    # Enable downloads for this one-off process only.
    os.environ["HF_HUB_OFFLINE"] = "0"
    os.environ["TRANSFORMERS_OFFLINE"] = "0"

    try:
        from huggingface_hub import snapshot_download
    except Exception as exc:  # noqa: BLE001
        print("huggingface_hub is not installed in this image.")
        print("Rebuild with: AI_INSTALL_MODELS=1 docker compose --profile ai build ai")
        print(f"({exc})")
        return 1

    target = os.environ.get("HF_HOME", "~/.cache/huggingface")
    print(f"Downloading {settings.classifier_model} into {target} ...")
    path = snapshot_download(repo_id=settings.classifier_model)
    print(f"Done: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
