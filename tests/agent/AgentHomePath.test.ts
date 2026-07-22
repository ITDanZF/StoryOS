import path from 'node:path';
import { homedir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAgentHome } from '../../src/main/agent/workspace/path.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getAgentHome', () => {
  it('uses .mini-agent under the current user home by default', () => {
    vi.stubEnv('MINI_AGENT_HOME', '');

    expect(getAgentHome()).toBe(path.join(homedir(), '.mini-agent'));
  });

  it('allows an explicit MINI_AGENT_HOME override', () => {
    const customHome = path.join(process.cwd(), 'custom-agent-home');
    vi.stubEnv('MINI_AGENT_HOME', `  ${customHome}  `);

    expect(getAgentHome()).toBe(path.resolve(customHome));
  });
});
