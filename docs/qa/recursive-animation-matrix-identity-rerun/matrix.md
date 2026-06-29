# Recursive Animation Matrix Identity Rerun

Date: 2026-06-29 JST
Branch: `codex/recursive-animation-matrix-identity-rerun`
Base commit: `99dc2a1` (`origin/main`, includes animation source selection guard)

## Purpose

Re-run the body-source x official animation preset matrix through the real Image Cockpit browser UI after the source-selection guard fix. This rerun explicitly records identity collapse separately from source-selection drift and quality gate failures.

## Browser / Runtime

- App URL: `http://127.0.0.1:5266/`
- API URL: `http://127.0.0.1:8866/api/health`
- Supervisor URL: `http://127.0.0.1:8876/api/dev/health`
- Handoff root: `tmp/recursive-animation-matrix-identity-rerun/handoff`
- Evidence root: `docs/qa/recursive-animation-matrix-identity-rerun/`
- Main merge: not required

## Trial Matrix

| Trial | Body category | Source image | Official preset | Expected risk focus |
| --- | --- | --- | --- | --- |
| T01 | Human male | `basic-young-male-hero.png` | `idle-breathing` | Baseline idle identity retention |
| T02 | Human male | `basic-young-male-hero.png` | `run-cycle` | Run stride / foot crop / motion clarity |
| T03 | Human female | `basic-young-female-hero.png` | `walk-cycle` | Walk motion too small / source isolation |
| T04 | Weapon | `profession-young-male-sword-fighter.png` | `basic-attack` | Weapon attack identity drift |
| T05 | Small / chibi | `basic-small-village-child.png` | `talk` | Talk/react motion too small |
| T06 | Small / chibi | `basic-small-village-child.png` | `hurt-reaction` | Chibi hit reaction identity retention |
| T07 | Robe / cloak | `basic-hooded-mysterious-figure.png` | `spell-cast` | Robe/caster genericization |
| T08 | Robe / cloak | `basic-hooded-mysterious-figure.png` | `death-downed` | Downed motion gate vs visual identity |
| T09 | Human female + weapon | `profession-young-female-ninja.png` | `basic-attack` | Kunoichi identity collapse |
| T10 | Large hat / complex silhouette | `profession-young-female-witch.png` | `jump-hop` | Hat/props crop and identity collapse |

Additional follow-up trials may be added inside the same evidence root if the first 10 show a repeated failure category.

## Required Classification Columns

Each trial report must include:

- UI/system status: `success`, `failed`, `needs_review`, or `external_blocked`
- Visual adoption: `visual_ok`, `visual_ng`, or `visual_review`
- Source match: whether `selectedImage.name` matches the intended fixture
- Identity collapse: `none`, `minor`, `major`, or `source_mismatch`
- Categories:
  - `usage_limit`
  - `policy_safety`
  - `imagegen_unavailable`
  - `quality_gate_failure`
  - `import_failure`
  - `chroma_residue`
  - `transparency_damage`
  - `head_or_feet_crop`
  - `motion_too_small`
  - `identity_collapse`
  - `external_block`

Usage limits and runner/imagegen availability blocks are external blocks, not quality failures.
