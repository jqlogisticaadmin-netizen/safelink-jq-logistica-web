# SafeLink web app

This directory contains the static browser client published by GitHub Pages. The canonical deployment is `.github/workflows/deploy-app-pages.yml`; the legacy root-site workflow is disabled to prevent competing deployments.

Supabase authentication and PostgreSQL RLS are required for access. Only the public publishable key may be used in the browser; never place a service-role key or server secret in this directory.

The dashboard queries live Supabase tables for the counts and recent events the signed-in user is authorized to see. SLA percentages and operational targets are intentionally not guessed: the business formulas and source-data mapping must be validated before those indicators are displayed.

The user administration module supports editing an existing profile's display name and active status, and editing/removing existing non-MASTER role assignments. New Auth accounts still require a trusted provisioning flow. Spreadsheet preview currently runs locally in the browser; persistent package import and several operational modules remain unfinished. This is an MVP under active implementation, not a claim of complete operational readiness.
