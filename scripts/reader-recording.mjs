import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Actual Chromium frames and timestamps. Recording is visual evidence, not a frame-rate benchmark.
export async function startReaderRecording(page, directory) {
  await mkdir(directory, { recursive: true });
  const cdp = await page.context().newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', event => {
    frames.push({ data: event.data, time: event.metadata.timestamp });
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1600, maxHeight: 1000, everyNthFrame: 1 });
  return async () => {
    await cdp.send('Page.stopScreencast'); await cdp.detach();
    const lines = ['ffconcat version 1.0'];
    for (let i = 0; i < frames.length; i++) {
      const name = `frame-${String(i).padStart(5, '0')}.jpg`;
      await writeFile(path.join(directory, name), Buffer.from(frames[i].data, 'base64'));
      lines.push(`file '${name}'`, `duration ${Math.max(.001, i + 1 < frames.length ? frames[i + 1].time - frames[i].time : .5)}`);
    }
    if (!frames.length) throw new Error('No actual rendering frames recorded');
    lines.push(`file 'frame-${String(frames.length - 1).padStart(5, '0')}.jpg'`);
    await writeFile(path.join(directory, 'frames.txt'), lines.join('\n'));
    const result = spawnSync(process.env.FFMPEG_PATH ?? 'C:/ffmpeg/bin/ffmpeg.exe', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'frames.txt', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p', '-fps_mode', 'vfr', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', 'reader-flow.mp4'], { cwd: directory, windowsHide: true, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Recording encode failed: ${result.stderr ?? result.error}`);
    return { frames: frames.length, duration: frames.at(-1).time - frames[0].time, path: path.join(directory, 'reader-flow.mp4') };
  };
}
