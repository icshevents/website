# Release state — 10 November 2026

Canonical source: `work/icsh-donate-copy-nov09` in the original website workspace. Verified hosting production deployment when preparing this commit: `dpl_HqcC45f9zkVyuMnvwteprVV5wuH7`, https://website-6ulfzdsve-icsh.vercel.app. Public site: https://icsh.org.uk.

GitHub main previously held only README.md and a placeholder index.html. The original draft pull request was never merged. The preview branch contained later website work; the live-payment branch is an ancestor of it. The sandbox branch has an older separate test implementation. Later production releases were deployed directly from local source and had not reached GitHub.

This reconciliation preserves branch commit ancestry while using the latest production implementation as the resulting source. It does not reinstate obsolete sandbox-only routes. Historical code remains available through Git history and existing branches.

The current implementation includes rolling annual membership, £20 Standard / £15 Pensioner / £0 eligible Student pricing, payment verification and recovery, membership activation, confirmation emails, all-tier WhatsApp invitation safeguards, shared-family-mobile rules with unique member email addresses, organiser membership tables and CSV export, and the latest public page copy. Source docs and tests provide detailed eligibility and integration rules.

Existing services: GitHub `icshevents/website`; Vercel project `website` (`prj_DCOHiPxvqSLB5or751jMeLsDeYzr`) in team `team_k3BeyiirmXvvseT27LycCVNB`; Supabase; Stripe; Zoho Bigin; Zoho transactional email/Campaigns; WhatsApp through Bigin. Reuse the existing services. Service access and environment values must be obtained securely by an authorised administrator; a Git checkout does not transfer account access or live database data.

## Assets and deployment

This repository is public. Community photograph/logo binaries remain excluded under the existing owner-review policy in `.gitignore`; complete assets are in the private website workspace and migration package. Public GitHub publication of these private binaries is not part of reconciling the existing branches. Restore `public/assets/` securely before building a complete deployment. Do not deploy a source-only checkout with missing images over production.

No production deployment or database migration is requested by this GitHub reconciliation. The existing production deployment remains the reference. Changes to GitHub can trigger any configured automation: confirm asset availability, production environment and build configuration before enabling Git-triggered deployments.

## Development

Use Node 24 and pnpm 11.25.0. Install with `pnpm install --frozen-lockfile`; run `pnpm test`, `pnpm typecheck`, and `pnpm build`. Keep private credentials in environment variables. For future work, start from main and merge reviewed, verified changes back into main so it stays current.

Git-triggered deployments from main are disabled with `git.deploymentEnabled.main=false` in vercel.json, to prevent this source-only reconciliation replacing the live site without its private assets. Direct authorised CLI deployments are separate. Restore the approved assets and review deployment configuration before enabling main auto-deployment. Configuration reference: https://vercel.com/docs/project-configuration/git-configuration.
