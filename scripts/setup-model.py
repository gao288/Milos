"""Download the published UniTalker ONNX checkpoint with an integrity check."""
import hashlib
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
URL = "https://github.com/LazyBusyYang/CatStream/releases/download/a2f_cicd_files/unitalker_v0.4.0_base.onnx"
SHA256 = "2f446ccaa0d5e901472e7214cdccd2373619d9cc5542c42abba47b29fd1f3fce"
target = ROOT / "models/unitalker_v0.4.0_base.onnx"
target.parent.mkdir(exist_ok=True)
if not target.exists():
    print("Downloading UniTalker ONNX (371 MiB)…", flush=True)
    temporary = target.with_suffix(".download")
    urllib.request.urlretrieve(URL, temporary)
    if hashlib.file_digest(temporary.open("rb"), "sha256").hexdigest() != SHA256:
        temporary.unlink()
        raise SystemExit("Checkpoint integrity check failed")
    temporary.replace(target)
if hashlib.file_digest(target.open("rb"), "sha256").hexdigest() != SHA256:
    raise SystemExit("Existing checkpoint does not match the expected SHA-256")
print("UniTalker checkpoint verified:", target)
