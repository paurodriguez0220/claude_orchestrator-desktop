import { describe, it, expect } from 'vitest';
import { IpcChannels } from './ipc-channels';

describe('IpcChannels', () => {
  it('every channel name is unique', () => {
    const values = Object.values(IpcChannels);
    expect(new Set(values).size).toBe(values.length);
  });
});
