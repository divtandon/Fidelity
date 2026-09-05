# CIFAR-10 evidence pipeline

This package is the executable path from a real CIFAR-10 ResNet-18 checkpoint
to a computed Fidelity report. It has no API key or paid-service dependency.

It trains (or resumes) a ResNet-18 adapted for 32x32 images, calibrates a
separate CPU copy on representative training images, performs FX static INT8
post-training quantization, then evaluates FP32 and INT8 on the same ordered
held-out CIFAR-10 loader. The resulting outputs are passed directly to
`validation.build_validation_report`; no metric is entered by hand.

## Install

Use CPython 3.11--3.13. The repository's validation engine itself works
without PyTorch, but running this pipeline needs a PyTorch wheel compatible
with your Python and platform.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install --index-url https://download.pytorch.org/whl/cpu -r pipeline/requirements.txt
```

For CUDA training, install the matching PyTorch/CUDA wheel selected by the
[official PyTorch installer](https://pytorch.org/get-started/locally/) instead.
INT8 FX inference remains CPU-only because it uses PyTorch quantized CPU ops.

## Run

```powershell
python -m pipeline --download --epochs 20 --device auto
```

The command writes a run directory under `artifacts/runs/<run-id>/` containing:

- `fp32-checkpoint.pt` — atomic checkpoint with model, optimizer, epoch and
  train configuration;
- `validation-report.json` — the strict, computed Fidelity report;
- `metadata.json` — reproducibility record with seed, device, ordered test
  sample fingerprint, calibration selection fingerprint, checkpoint SHA-256,
  PyTorch versions and quantization backend.

After the run directory and metadata are complete, the same validated report
is atomically published to `artifacts/latest-report.json`. That stable path is
the optional API's default input; use `--latest-report-path` to change it.

Nothing under `artifacts/`, `data/`, or `models/` is tracked by git. A command
only prints values it observed during its own training or evaluation.

Resume an interrupted checkpoint with the same total epoch target. Fidelity
uses an epoch-indexed cosine schedule and rejects changed optimizer or schedule
settings so the resumed training claim remains reproducible:

```powershell
python -m pipeline --download --resume artifacts/runs/<run-id>/fp32-checkpoint.pt --epochs 20
```

Use `--epochs 0 --resume <checkpoint>` to evaluate an already-trained
checkpoint without more optimization; the checkpoint's original train
configuration is retained in the new run. Run `python -m pipeline --help` for
all resource and reproducibility controls.
