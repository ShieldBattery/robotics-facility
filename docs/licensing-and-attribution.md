# Bot licensing and modification disclosure

Status: required release-review and app-display policy. The bot detail UI and full
release-specific display metadata are not implemented yet. Existing validation
requires approved local-distribution permission and source review; those fields
record a review decision, not an automated determination of license compliance.

## Bot detail display

Show the following for the selected release, including an installed release that
has disappeared from the current catalog:

- Original bot name, upstream authors and copyright attribution, and upstream link.
- Upstream version/revision and our distinct package version.
- If modified, a clear "Modified by ShieldBattery" notice (or the actual downstream
  modifier), modification dates, and a short description of what changed. Distinguish
  compatibility/storage changes from changes to play strategy. Preserve upstream
  authorship; packaging or patching a bot does not make ShieldBattery its author.
- Applicable licenses and an accessible **Licenses and notices** view containing the
  complete packaged license, copyright, attribution, and NOTICE texts, including
  bundled dependencies, host code, and assets where applicable.
- **Source and changes** links for the exact released source, downstream patches,
  and build materials. Identify any source download that needs internet access.

Keep notices and modification descriptions in the immutable package and retain the
release metadata on installation so they remain readable offline. A remote link or
an SPDX label alone is not the local license-text view. Present these disclosures
as readable text; do not execute HTML supplied by a bot package. An update must not
replace the displayed provenance of an older installed release.

Display attribution for an unmodified upstream build without claiming it is patched.
If only a bundled dependency is patched, identify that component rather than saying
the bot's strategy changed. Do not imply upstream endorsement, or apply an upstream
ladder rating to a modified build without evidence for that exact build.

## Package and source obligations

The display is one part of distribution compliance. Review the actual licenses of
the pinned bot, dependencies, host/runtime, assets, and our changes. Do not assume
the top-level license covers every bundled component. Keep upstream notices intact
and license downstream contributions compatibly; this repository's packaging does
not relicense upstream code. Review naming/trademark conditions separately where
applicable.

Maintain a readable modification record with component, modifier, date, affected
files, and summary, tied to the release's exact source revisions and ordered patch
hashes. Add modification notices to changed source files when the applicable license
requires that placement; a detail-page label or central changelog does not replace
file-level requirements.

When corresponding source is required, distribute the exact modified source and
required build materials through a license-permitted delivery method. Our default
is a durable, versioned source download alongside the binary, with a clear link from
the same download/detail surface. Preserve it for the required availability period.
A moving upstream branch, a link to the unmodified project, or a patch list alone is
not our source-delivery plan. Include the applied source, patches, build scripts,
configuration, and other materials required by the relevant license. Confirm the
source bundle matches the distributed binary inputs before approval. For GPLv3
section 6(d) delivery, provide equivalent access to corresponding source at no
further charge, with clear directions next to the object-code download.

For LGPL components, inspect the actual linking and packaging arrangement and any
required ability/materials to replace, modify, or relink the library. A source link
alone does not settle those obligations. Record the chosen compliance method for
that release rather than assuming all external-process bots have the same obligations.
Where LGPLv3 combined-work requirements apply, include both GPL and LGPL texts and
the library-use notice, preserve the required modification/debugging rights, and
check any runtime copyright-display requirements as well.

## Approval evidence

Before approving `permissions.localDistribution`, the release reviewer records:

1. Component/license inventory, including our changes, dependencies, and assets;
   any additional grant must cover the actual modified distribution and version.
2. Exact packaged notice paths and required modified-file notices, verified against
   the archive and corresponding source. Map each component to its notices.
3. The released source/build-material locations and digests, the delivery method,
   and any source-availability or LGPL replacement/relinking obligations.
4. The proposed user-visible author, license, and modification disclosures, checked
   against the actual release inputs. Retain this information with the release.
5. Reviewer, date, reviewed artifact/input hashes, evidence, and any unresolved
   obligation. An unresolved obligation prevents approval.

Repeat the licensing review when patches, dependencies, source pins, build/linking
choices, or notices change. Local distribution and public competition approval stay
separate. Author outreach helps resolve permission and attribution questions, but
does not replace third-party dependency obligations.

The draft package schema currently carries source pins/patch hashes and
`licenses[].name`/`noticePath`; the publisher verifies that referenced notice files
exist. It does not inspect their legal completeness, verify corresponding-source
availability, or provide structured modification-display fields. Complete that
metadata and the installer/detail view before shipping catalog installation in the
app. Do not treat passing schema/archive validation as completing this review.

## License references

Apply the exact version and terms found in each pinned component. Examples that
explain why the release review covers more than an in-app label:

- [MIT](https://opensource.org/license/mit) requires preservation of its copyright
  and permission notice in copies or substantial portions.
- [Apache 2.0, section 4](https://www.apache.org/licenses/LICENSE-2.0) covers license
  copies, changed-file notices, retained attribution, and applicable NOTICE content.
- [GPLv3, sections 5 and 6](https://opensource.org/license/gpl-3.0) cover modified
  works and conveying non-source forms, including corresponding-source delivery.
- [LGPLv3](https://opensource.org/license/lgpl-3-0) incorporates GPLv3 with additional
  permissions and conditions, including requirements for combined works.
