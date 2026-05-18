import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODECS, parseTrim, clipLength, trimArgs, codecArgs, videoArgs, audioArgs,
  videoFileName, audioFileName, resultInfo, stageText, errorText, looksLikeVideo,
} from '../../src/utilities/convert-media/convert-media.js';
import { CancelledError } from '../../src/utilities/vendor/ffmpeg/loader.js';

test('trim times: empty, seconds and minutes:seconds', () => {
  assert.deepEqual(parseTrim('', ''), { start: null, end: null });
  assert.deepEqual(parseTrim(' 1:15 ', '90'), { start: 75, end: 90 });
  assert.deepEqual(parseTrim('', '1:02:03.5'), { start: null, end: 3723.5 });
  assert.deepEqual(parseTrim('2.5', ''), { start: 2.5, end: null });
});

test('invalid trim times throw the message shown to the user', () => {
  assert.throws(() => parseTrim('abc', ''), { message: 'Check the trim times.' });
  assert.throws(() => parseTrim('', '1:xx'), { message: 'Check the trim times.' });
  assert.throws(() => parseTrim('10', '5'), { message: 'Trim end must be after the start.' });
  assert.throws(() => parseTrim('0:10', '10'), { message: 'Trim end must be after the start.' });
});

test('clip length for the progress bar', () => {
  assert.equal(clipLength(null, null, 120), 120);
  assert.equal(clipLength(30, null, 120), 90);
  assert.equal(clipLength(10, 25, 120), 15);
  assert.equal(clipLength(null, null, 0), 0); // unknown duration
  assert.equal(clipLength(30, null, 0), 0); // never negative
});

test('trim args seek on the input and limit the length with -t', () => {
  assert.deepEqual(trimArgs(null, null, '/in/a.mp4'), ['-i', '/in/a.mp4']);
  assert.deepEqual(trimArgs(5, null, '/in/a.mp4'), ['-ss', '5', '-i', '/in/a.mp4']);
  assert.deepEqual(trimArgs(5, 20, '/in/a.mp4'), ['-ss', '5', '-i', '/in/a.mp4', '-t', '15']);
  assert.deepEqual(trimArgs(null, 20, '/in/a.mp4'), ['-i', '/in/a.mp4', '-t', '20']);
});

test('video: MP4 at 720p medium quality (the defaults)', () => {
  assert.deepEqual(videoArgs({ input: '/in/clip.mov', start: null, end: null, fmt: 'mp4', res: '720', quality: 'medium' }), [
    '-i', '/in/clip.mov',
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', "scale=-2:'trunc(min(ih,720)/2)*2'",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    'output.mp4',
  ]);
});

test('video: original resolution keeps even dimensions; MOV uses H.264 too', () => {
  const args = codecArgs('mov', '0', 'high');
  assert.equal(args[args.indexOf('-vf') + 1], 'scale=trunc(iw/2)*2:trunc(ih/2)*2');
  assert.equal(args[args.indexOf('-c:v') + 1], 'libx264');
  assert.equal(args[args.indexOf('-crf') + 1], '20');
  assert.equal(codecArgs('mp4', '480', 'low')[codecArgs('mp4', '480', 'low').indexOf('-crf') + 1], '32');
});

test('video: WebM uses VP8 + Opus with its own CRF scale', () => {
  const args = codecArgs('webm', '1080', 'low');
  assert.deepEqual(args.slice(args.indexOf('-c:v')), ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8',
    '-crf', '30', '-b:v', '4M', '-c:a', 'libopus', '-b:a', '96k']);
  assert.equal(codecArgs('webm', '1080', 'high')[args.indexOf('-crf') + 1], '8');
});

test('video: audio only drops the video stream', () => {
  assert.deepEqual(videoArgs({ input: '/in/v.mp4', start: 1, end: 4, fmt: 'mp3', res: '720', quality: 'medium' }),
    ['-ss', '1', '-i', '/in/v.mp4', '-t', '3', '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', 'output.mp3']);
});

test('audio: lossy formats take the bitrate, lossless ones do not', () => {
  assert.deepEqual(audioArgs({ input: '/in/song.wav', start: null, end: null, fmt: 'mp3', bitrate: '192' }),
    ['-i', '/in/song.wav', '-vn', '-map_metadata', '0', '-c:a', 'libmp3lame', '-b:a', '192k', 'output.mp3']);
  assert.deepEqual(audioArgs({ input: '/in/song.mp3', start: 60, end: 90, fmt: 'flac', bitrate: '320' }),
    ['-ss', '60', '-i', '/in/song.mp3', '-t', '30', '-vn', '-map_metadata', '0', '-c:a', 'flac', 'output.flac']);
  assert.deepEqual(audioArgs({ input: 'x', start: null, end: null, fmt: 'wav', bitrate: '96' }).slice(-3), ['-c:a', 'pcm_s16le', 'output.wav']);
  assert.equal(CODECS.opus.mime, 'audio/ogg');
  assert.equal(CODECS.m4a.args[1], 'aac');
});

test('output file names', () => {
  assert.equal(videoFileName('holiday.final.mov', 'mp4'), 'holiday.final-converted.mp4');
  assert.equal(videoFileName('clip.mp4', 'mp3'), 'clip.mp3');
  assert.equal(videoFileName('noext', 'webm'), 'noext-converted.webm');
  assert.equal(audioFileName('song.wav', 'flac'), 'song.flac');
});

test('result line escapes the name and warns about MOV previews', () => {
  assert.equal(resultInfo('a<b>.mp4', 1536, 'mp4'), 'a&lt;b&gt;.mp4 · 1.5 KB');
  assert.equal(resultInfo('a.mov', 3 * 1024 * 1024, 'mov'), 'a.mov · 3.0 MB · MOV may not preview in every browser');
});

test('status texts', () => {
  assert.equal(stageText('loading'), 'Loading converter (~32 MB, only once)…');
  assert.equal(stageText('converting'), 'Converting…');
  assert.equal(errorText(new CancelledError()), 'Cancelled.');
  assert.equal(errorText(new Error('Invalid data found when processing input')), 'Failed: Invalid data found when processing input');
});

test('video guess from type and extension', () => {
  assert.equal(looksLikeVideo({ type: 'video/mp4', name: 'a' }), true);
  assert.equal(looksLikeVideo({ type: '', name: 'movie.MKV' }), true);
  assert.equal(looksLikeVideo({ type: 'audio/mpeg', name: 'song.mp3' }), false);
  assert.equal(looksLikeVideo({ type: '', name: 'mkv.flac' }), false);
});
