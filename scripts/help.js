// Lists the skill scripts and their options. Under cloudapper_run, runner.mjs answers `script:'help'` itself from
// the header comment of each scripts/*.js (spec { script:'<name>' } returns one header in full).
async function help() { return 'Run through cloudapper_run: the runner returns the script headers.'; }

await help(globalThis.CAE_OPTIONS || {});
