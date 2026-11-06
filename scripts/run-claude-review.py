#!/usr/bin/env python3
"""Bounded, tool-free Claude Code subscription reviews. No Git or API credentials."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser()
parser.add_argument('--packet', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('--timeout', type=int, default=600)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
packet_path = Path(args.packet).resolve()
packet = json.loads(packet_path.read_text())
output = Path(args.output).resolve()
if not output.is_relative_to(root):
    raise SystemExit('Review output must stay inside the project.')
env = dict(os.environ)
for key in ('ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
            'ANTHROPIC_BEDROCK_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK',
            'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'):
    env.pop(key, None)
auth = subprocess.run(['/opt/homebrew/bin/claude', 'auth', 'status'], env=env,
                      text=True, capture_output=True, timeout=30)
try:
    status = json.loads(auth.stdout)
except json.JSONDecodeError:
    raise SystemExit('Claude subscription authentication could not be verified.')
if not status.get('loggedIn') or status.get('authMethod') != 'claude.ai':
    raise SystemExit('A Claude Code subscription login is required; no API fallback.')
sections = [packet['objective'], '\nTASK CONTRACT\n' + json.dumps(packet, indent=2)]
for name in packet.get('input_artifacts', []):
    path = Path(name)
    if not path.is_absolute():
        path = root / path
    if not path.is_file():
        sections.append(f'\nUNAVAILABLE ARTIFACT: {name}\n')
        continue
    if path.suffix.lower() == '.pdf':
        extracted = subprocess.run(['pdftotext', '-layout', str(path), '-'],
                                   text=True, capture_output=True, timeout=30, check=True).stdout
    else:
        extracted = path.read_text()
    sections.append(f'\nARTIFACT: {name}\n{extracted}\n')
prompt = '\n'.join(sections)
if len(prompt) > 220000:
    raise SystemExit('Packet exceeds bounded review input; split the task.')
system = ('You are an independent scientific and software reviewer for Knitting Topology. '
          'Review only supplied artifacts. You have no tools and must not invoke tools, '
          'subagents, Git, network, or file operations. Distinguish geometric verification '
          'from physical validation. Be concise and actionable. Do not invent checks, '
          'references, unavailable source, or results. Return assumptions, prioritized '
          'findings, discriminating test cases, and a narrow recommended implementation. '
          'Important: the project uses meters internally, millimeters in UI, explicit '
          'graph topology; no textile/mechanical/manufacturing validity is established.')
started = time.time()
with tempfile.TemporaryDirectory(prefix='kt-review-') as task_dir:
    # The client cannot accidentally run Git even during startup/context detection.
    guard = Path(task_dir) / 'git'
    guard.write_text('#!/bin/sh\nexit 126\n')
    guard.chmod(0o755)
    env['PATH'] = task_dir + os.pathsep + env.get('PATH', '')
    command = ['/opt/homebrew/bin/claude', '-p', '--model', 'claude-opus-5-5',
               '--effort', 'high', '--output-format', 'json', '--tools', '',
               '--permission-mode', 'dontAsk', '--safe-mode', '--setting-sources', '',
               '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
               '--no-session-persistence', '--system-prompt', system]
    result = subprocess.run(command, input=prompt, text=True, capture_output=True,
                            env=env, cwd=task_dir, timeout=args.timeout)
try:
    response = json.loads(result.stdout)
except json.JSONDecodeError:
    response = {'raw_output': result.stdout, 'stderr': result.stderr}
record = {'task_id': packet['task_id'], 'provider': 'anthropic',
          'requested_model': 'claude-opus-5-5', 'auth_method': 'claude.ai',
          'tools_enabled': False, 'elapsed_seconds': round(time.time()-started, 2),
          'exit_code': result.returncode, 'response': response}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps({'task_id': packet['task_id'], 'output': str(output.relative_to(root)),
                  'exit_code': result.returncode, 'elapsed_seconds': record['elapsed_seconds'],
                  'is_error': response.get('is_error'),
                  'models_reported': list(response.get('modelUsage', {}))}))
raise SystemExit(result.returncode)
