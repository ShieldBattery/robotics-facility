# BananaBrain sb.6 installed-runtime validation

Local verification: 2026-10-28 (Europe/Paris). Exact experimental review artifact;
source review remains pending, local distribution unreviewed and production
approval deferred. No catalog admission, merge, public upload or promotion occurred.
This report supplements [earlier sb.6 checks](bananabrain-sb-6.md); it does not
replace their original bounded-game scope or approve historical sb.5 bytes.

## Artifact and client

- Review ZIP SHA-256: `e19593287f154f2ba5447ed992a2d55904e53837a99a21352dbd643b37eed358`.
- Descriptor SHA-256: `2b6affc61bf72577cedd6ad9bf778bf22301231bebfdfe3c5d585a6d9dfc10e1`.
- Executable SHA-256: `bc5190ffc62c889e80e970a5fff1910b6ebc3da7c855006a682fe84ad571f795`.
- Committed recipe: `4db55bff4aa33b5d1726d68a56db48ff6422beca`; source import
  `f66d7336ca61a0a0a1a984fad55c162d942694e4`. No artifact or recipe input changed.
- Actual Electron app source: `04dc6ee699b4cfbf91dc66a1d0b61d84ccfc2c89`;
  Electron 44.9.3. Fresh isolated userData/session, installed review package and
  existing separate game copy; no accounts or public lobbies.
- Observed loaded x64 DLL SHA-256:
  `795bae04ef408bab42b6dc02f94aac6872ac0d75d4b77ef2e8b57d0ed7ad1a6d`,
  integration source `07595bd56318a5ad4272004c4e3cffac2bd13722`.
- Assigned Protoss Win32 bot versus passive controlled Terran, x64 StarCraft,
  Fighting Spirit 1.4, one player per side in Top vs Bottom. ShieldBattery map hash:
  `a55209a4ea0d368056b8e5c1be94092254610e744ad2186685c0387f8c08c4b9`.

## Genuine signature and actual Electron installation

Exact ZIP installed through real `botLibraryRefreshCatalog` / `botLibraryInstall`
IPC using an ephemeral Ed25519 development trust identity and loopback HTTP
fixture. Signature, archive hash, descriptor equality and normal client validation
remained enabled. Modified signatures, modified ZIP bytes and a genuinely signed
but mismatched descriptor were rejected. Failed installations preserved the
existing immutable package; all seven declared notices were readable via IPC.

The normal robotics publisher correctly rejected the unchanged pending-review
catalog. A local client-test envelope was signed using the same payload contract,
with the review descriptor still pending/unreviewed; no admission fields were
changed to make it publishable. This exercises the development client's verifier
and installer, not production publisher eligibility. HTTP was restricted to
loopback. Production keys, HTTPS/CDN delivery and authenticated UI navigation are
not covered. No global certificate trust or integrity check was disabled.

## Match outcomes and real history

| Run | Finish | End frame | Opening | Accepted / rejected commands | Saved rows |
| --- | --- | --- | --- | --- | --- |
| 1 | Natural BananaBrain win | 12,248 | `PvT_bulldog` | 13,963 / 1 | 1 |
| 2 | Terran concession confirmed by user | 7,297 | `PvT_10/15gate` | 2,730 / 0 | 2 |
| 3 | Replacement natural BananaBrain win after reset | 6,637 | `PvT_4gategoon` | 2,142 / 0 | 1 |

Run 2 must not be counted as natural completion. The initial automated runner
inferred natural completion from a bot end callback; the user then confirmed
leaving the Terran game while it was running. Classification was corrected and
run 3 supplied the replacement natural match. Actual result rows were not edited.
Natural results were observed before supervised result-screen/session cleanup;
cleanup did not cause the two natural wins.

Every saved winner/frame matched its native end callback. Run 2 reloaded run 1's
actual history: the first row remained byte-identical when a second real row was
saved, despite malformed stale read input under the same opponent filename.
Distinct opening choices before reset agree with the human-opponent UCB1 policy;
this is persistence/exploration evidence, not human difficulty calibration.
After reset, run 3 began without saved results and wrote one fresh real row.
Original saved-result snapshots are preserved privately by SHA-256; public record
contains hashes and parsed outcomes, not account/control data or fabricated rows.

One rejection remains unclassified. It first appears in run 1's frame-12,240
snapshot; no unsupported/malformed encoder message identifies its branch-level
cause. The report retains the count rather than claiming zero rejections or
complete command conformance. Runs 2 and 3 had zero recorded rejections.

Follow-up: [local command-rejection investigation](bananabrain-sb-6-rejection-investigation-20261028.md)
reproduced expired actor/target IDs with debug diagnostics on both game architectures.
The original packet remains unrecoverable; its historical classification above is unchanged.

## Actual reset and offline behavior

`botLibraryResetLearning` rejected reset while each game held its bot lease.
Following runs 1/2, idle reset cleared both mutable read/write directories and
removed the learning-data marker with zero catalog/archive requests while the
fixture endpoint was configured unavailable. Package files and all 12 original
AI files remained unchanged. Run 3 then launched from cached installed bytes.

After preserving run 3's actual result, the loopback catalog server was physically
stopped and confirmed unreachable. A second real idle reset via Electron IPC
succeeded, cleared that saved history, kept read/write empty, preserved all 12 AI
files and every installed package file, and cleared the learning-data marker.
These are actual IPC/lifecycle checks, not renderer reset-button navigation.

All test-owned Electron/server/harness processes exited and the private CDP
listener closed. Existing user processes, installed game and pinned bot bundles
were not modified. Raw game/control logs and actual state backups remain private.

## Remaining admission limits

Upstream source hosting and maintainer source/distribution/roster review remain
open. Human strength, active-human play, other opponent races/maps, x86 StarCraft,
Random/Terran/Zerg assignments, teams/FFA, shared-profile writers and exhaustive
OS tracing are not established. This is not an OS sandbox or signed public
staging/CDN delivery certification. The normal publisher still rejects pending
review metadata, and no production approval is requested.

[Structured evidence](bananabrain-sb-6-runtime-validation-20261028.json) records
outcomes, saved-state digests, native-log hashes, exact client fingerprint,
concession correction and cleanup checks.
