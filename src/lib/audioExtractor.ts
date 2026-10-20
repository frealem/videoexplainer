/**
 * VideoExplainer Client-Side Audio Extractor & Resampler
 * 
 * Securely extracts, downsamples, and packages the audio track from video (MP4, WEBM, MOV) or
 * large audio files directly in the browser using the native Web Audio API and OfflineAudioContext.
 * 
 * Features:
 * - Automatically downsamples to voice-optimized sample rates (16kHz, 12kHz, or 8kHz) based on duration.
 * - Converts stereo channels to highly-dense mono channel.
 * - Compiles to standard IEEE 16-bit PCM WAV.
 * - Reduces network payloads from hundreds of megabytes to a tiny, fast-uploading WAV file.
 * - Gracefully falls back to original files if decoding fails.
 */

export async function extractAndCompressAudio(
  file: File,
  onProgress?: (status: string) => void
): Promise<{ data: Blob; mimeType: string; isOptimized: boolean }> {
  // If the file is not a video or audio, or if it is very small (under 1MB), skip extraction
  const isVideo = file.type.startsWith('video/') || ['.mp4', '.mov', '.webm', '.mkv'].some(ext => file.name.endsWith(ext));
  const isAudio = file.type.startsWith('audio/') || ['.mp3', '.wav', '.m4a', '.wma', '.aac'].some(ext => file.name.endsWith(ext));
  
  if (!isVideo && !isAudio) {
    return { data: file, mimeType: file.type || 'application/octet-stream', isOptimized: false };
  }

  // Under 2MB we don't strictly need to compress unless it is a video (converting video to raw audio still saves bandwidth)
  if (!isVideo && file.size < 2 * 1024 * 1024) {
    return { data: file, mimeType: file.type || 'audio/mp3', isOptimized: false };
  }

  try {
    onProgress?.("Reading local file into memory...");
    const arrayBuffer = await readFileAsArrayBuffer(file);

    onProgress?.("Extracting spoken audio track...");
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (decodeError) {
      console.warn("[AudioExtractor] Native decoding failed, falling back to original upload", decodeError);
      return { data: file, mimeType: file.type || 'application/octet-stream', isOptimized: false };
    } finally {
      await audioCtx.close();
    }

    const duration = audioBuffer.duration;
    if (duration === 0) {
      throw new Error("Zero-duration media file");
    }

    // Determine target sample rate based on duration to optimize network upload weight and speed
    // 16kHz is perfect for short clips. 12kHz/8kHz are pristine for dialogue and keep 30+ min files very small.
    let targetSampleRate = 16000;
    if (duration > 1800) { // > 30 minutes
      targetSampleRate = 8000;
    } else if (duration > 600) { // > 10 minutes
      targetSampleRate = 12000;
    }

    onProgress?.(`Optimizing audio data (${Math.ceil(duration / 60)} min, mono @ ${targetSampleRate / 1000}kHz)...`);

    // Use OfflineAudioContext for extremely fast non-blocking downsampling
    const offlineCtx = new OfflineAudioContext(
      1, // Mono (1 channel)
      Math.ceil(duration * targetSampleRate),
      targetSampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();

    const renderedBuffer = await offlineCtx.startRendering();

    onProgress?.("Formulating high-efficiency WAV content...");
    const wavBlob = bufferToWav(renderedBuffer);

    console.log(
      `[AudioExtractor] Optimized successfully! Original size: ${(file.size / (1024 * 1024)).toFixed(2)}MB -> Extracted WAV: ${(wavBlob.size / (1024 * 1024)).toFixed(2)}MB`
    );

    return {
      data: wavBlob,
      mimeType: "audio/wav",
      isOptimized: true
    };
  } catch (error) {
    console.error("[AudioExtractor] Optimization failed, using raw upload stream", error);
    return { data: file, mimeType: file.type || 'application/octet-stream', isOptimized: false };
  }
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file as ArrayBuffer"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = 1; // mono
  const sampleRate = buffer.sampleRate;
  const format = 1; // 1 = raw PCM
  const bitDepth = 16;
  
  const result = buffer.getChannelData(0); // get mono channel data
  const bufferLen = result.length * 2; // 16-bit PCM (2 bytes per sample)
  const wavBuffer = new ArrayBuffer(44 + bufferLen);
  const view = new DataView(wavBuffer);
  
  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + bufferLen, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numOfChan, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * numOfChan * (bitDepth / 8), true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numOfChan * (bitDepth / 8), true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, bufferLen, true);
  
  // Write PCM audio samples
  floatTo16BitPCM(view, 44, result);
  
  return new Blob([wavBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}
