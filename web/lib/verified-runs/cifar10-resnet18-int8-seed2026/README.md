# Verified CIFAR-10 run

This directory contains the exact public report and metadata produced by a real
Fidelity run. The JSON files are committed with LF line endings so their
recorded SHA-256 values remain stable across platforms.

## Observed result

| Evidence | Observed value |
| --- | ---: |
| FP32 top-1 accuracy | 92.39% (9,239 / 10,000) |
| INT8 top-1 accuracy | 92.38% (9,238 / 10,000) |
| Candidate change | -0.01 percentage points |
| Paired Wilcoxon p-value | 1.0 (39 non-zero pairs, exact permutation) |
| Mean KL(reference || candidate) | 0.0004199851152058104 nats |
| Largest absolute class movement | cat, +0.9 percentage points |
| Backend policy result | `ready` (no crossed guardrails) |

`ready` means only that this run did not cross the serialized
`fidelity_default` policy thresholds. The non-significant paired result is not
evidence of statistical equivalence, and this report does not certify safety,
fairness, robustness, latency, or suitability for deployment.

## Reproduction record

The FP32 model was trained for 20 epochs with seed 2026 on CUDA using the
pipeline introduced in commit
`f1d7c1cf5b98427908545df431f04db26b4a544f`. The final epoch observed mean
cross-entropy 0.07139704094171524 over all 50,000 training examples.

```powershell
.\.venv\Scripts\python.exe -u -m pipeline `
  --data-dir data/cifar10-hf --download --epochs 20 `
  --run-id cifar10-resnet18-int8-seed2026-real --num-workers 4 `
  --train-batch-size 128 --evaluation-batch-size 512 `
  --calibration-samples 2048 --max-calibration-batches 8 --device cuda
```

The official report was then reproduced from that checkpoint using the
hardened pipeline/export implementation in commit
`0c469a7fbd65a9a4de6ea53a80e11df2725af2ec`. This pass exported a standalone
TorchScript INT8 module, reloaded it, and evaluated the reloaded artifact on the
same ordered 10,000-example held-out test split as the FP32 reference.

```powershell
.\.venv\Scripts\python.exe -u -m pipeline `
  --data-dir data/cifar10-hf --no-download --epochs 0 `
  --resume artifacts/runs/cifar10-resnet18-int8-seed2026-real/fp32-checkpoint.pt `
  --run-id cifar10-resnet18-int8-seed2026 --num-workers 4 `
  --evaluation-batch-size 512 --calibration-samples 2048 `
  --max-calibration-batches 8 --device cuda
```

The source checkpoint hash in `metadata.json` matches the checkpoint produced
by the training run. Generated model files remain git-ignored and are not
distributed in this repository.

## Integrity values

| Artifact or observation | SHA-256 |
| --- | --- |
| Source training checkpoint | `e8fd950547336af995aad6a727b8651caf7990bb62f90a71e06f8f4c4fc72d5e` |
| Self-contained evaluation checkpoint | `d17e9d718bb83201a83ce7fceaffa80787a38d6dd899d80bd6587e60095e6b04` |
| Reloaded INT8 TorchScript artifact | `a108dbcb9111ea27d362fcecb1ad27e2a86f2ab886d2974211bf3c49acc685ae` |
| Validation report | `ef3a5b590238fd43dfb57f33473ac7e55706dbf9964600062b11743b6fe7b5e9` |
| Run metadata | `a2e83a3588de058980da9c121858f3ec7db1639ceab2a1dbfe0fa41bc929bc11` |
| CIFAR-10 source archive | `6d958be074577803d12ecdefd02955f39262c83c16fe9348329d7fe0b5c001ce` |
| Held-out test order | `cc3d359d93e107e6de4d989225c82d2ae2686d635cec7f2d42ddaf7c52fd256e` |
| Calibration selection/order | `b95078a1cccb1cfad37b5ec388b874bda825372392b3bfa678695d0a284debaa` |
| FP32 ordered outputs | `2debdcf5245860c95fc86fff92e8ae727adad1b9fcdac0480c8cfa8530a33465` |
| INT8 ordered outputs | `99ffa3f325a66d33459c9469548dddadd3ad896784b27b234682d23fbefcc551` |

The authoritative Python loader can revalidate the tracked report directly:

```powershell
.\.venv\Scripts\python.exe -c "from validation.serializer import load_report; load_report(r'web/lib/verified-runs/cifar10-resnet18-int8-seed2026/report.json'); print('valid')"
```
