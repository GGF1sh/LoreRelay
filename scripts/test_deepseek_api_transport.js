const { spawnSync } = require('node:child_process');
const path = require('node:path');
const run = spawnSync(process.platform === 'win32' ? 'python' : 'python3',
    [path.join(__dirname, 'test_deepseek_api_transport.py')], { encoding: 'utf8', timeout: 30000, windowsHide: true });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
if (run.error) console.error('Python API transport tests could not start:', run.error.code);
process.exitCode = run.status === 0 && !run.error ? 0 : 1;
