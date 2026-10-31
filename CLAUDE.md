# Ballpoint Pen Teardown - Claude Code Rules

## Project boundary
- Work only inside E:\ClaudeCode\Projects\Ballpoint-Pen-Teardown.
- Never read, create, modify, delete, or move files outside this project.
- External installed runtimes may be executed, but project output must remain inside this project.
- Never run as Administrator.
- Never use --dangerously-skip-permissions.
- Never access credentials, browser profiles, environment secrets, API keys, or unrelated repositories.

## Workflow
- Inspect existing files and the teardown skill before proposing implementation.
- Use Git and keep the working tree understandable.
- Do not rewrite or remove the installed teardown skill.
- Before editing, explain the intended batch and affected files.
- Make small, cohesive implementation batches.
- Run appropriate tests after every implementation batch.
- Never claim success without running the relevant test.
- Preserve a cumulative regression suite under tests.
- Do not delete tests merely because they fail.
- Do not push to GitHub unless explicitly asked.
- Do not deploy or publish the simulator unless explicitly asked.

## Coding rules
- The mechanism model comes before visual animation.
- Use one canonical state model for the pen.
- Every moving part, measurement, panel, label, and chart must derive from that state.
- Do not manually animate independent parts.
- Keep mechanism dimensions and assumptions in one documented parameter block.
- Clearly label estimated dimensions and forces.
- Do not present invented values as manufacturer specifications.
- Prefer pure functions for mechanism state and deterministic rendering.
- Use a fixed or explicitly controlled time input for tours and recordings.
- Keep runtime dependencies minimal.
- Do not embed secrets, analytics, tracking, or remote telemetry.

## Validation
- Validate the retracted, pressing, transition, latched, and extended states.
- Validate that displayed measurements agree with the visual pose.
- Check for disconnected, floating, or intersecting parts.
- Check responsive layout at desktop and narrow widths.
- Test using Playwright Chromium.
- Capture validation screenshots under screenshots.
- Record known limitations honestly.

## Release discipline
- Do not create a release until tests pass.
- Before a release, report tests run, results, and paths not tested.
- Keep generated video and large temporary artifacts out of Git unless explicitly requested.

## Public demo maintenance
- GitHub Pages is the canonical public demo.
- Any future release or user-visible change must be pushed to main.
- The Pages workflow must be allowed to complete successfully.
- Before reporting a release complete, verify that the live GitHub Pages deployment corresponds to the newest main commit.
- Never leave the public demo intentionally behind the newest stable version.
