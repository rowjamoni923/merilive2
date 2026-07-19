/**
 * =============================================================================
 * MeriLive Video Processing SDK
 * =============================================================================
 * 
 * Client-side video processing utilities for:
 * - Video compression & resizing
 * - Frame extraction & thumbnails
 * - Video filters & effects
 * - Format conversion
 * - Video trimming
 * 
 * =============================================================================
 */

// =============================================================================
// Types
// =============================================================================

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  aspectRatio: number;
  size: number;
  type: string;
}

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 - 1.0
  frameRate?: number;
  videoBitrate?: number;
}

export interface ThumbnailOptions {
  time?: number; // seconds
  width?: number;
  height?: number;
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number;
}

export interface VideoFilter {
  type: 'brightness' | 'contrast' | 'saturate' | 'grayscale' | 'sepia' | 'blur' | 'none';
  value?: number;
}

export interface TrimOptions {
  startTime: number;
  endTime: number;
}

export interface ProcessingProgress {
  stage: 'loading' | 'processing' | 'encoding' | 'complete';
  progress: number; // 0-100
  message: string;
}

// =============================================================================
// Video Processing SDK
// =============================================================================

export class VideoProcessingSDK {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private videoElement: HTMLVideoElement;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.videoElement = document.createElement('video');
    this.videoElement.muted = true;
    this.videoElement.playsInline = true;
    
    console.log('[VideoSDK] Initialized');
  }

  // ===========================================================================
  // Video Metadata
  // ===========================================================================

  async getMetadata(source: File | Blob | string): Promise<VideoMetadata> {
    const video = await this.loadVideo(source);
    
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      aspectRatio: video.videoWidth / video.videoHeight,
      size: source instanceof Blob ? source.size : 0,
      type: source instanceof Blob ? source.type : 'video/mp4',
    };
  }

  private loadVideo(source: File | Blob | string): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        video.currentTime = 0;
      };

      video.onseeked = () => {
        resolve(video);
      };

      video.onerror = () => {
        reject(new Error('Failed to load video'));
      };

      if (typeof source === 'string') {
        video.src = source;
      } else {
        video.src = URL.createObjectURL(source);
      }
    });
  }

  // ===========================================================================
  // Thumbnail Generation
  // ===========================================================================

  async generateThumbnail(
    source: File | Blob | string,
    options: ThumbnailOptions = {}
  ): Promise<string> {
    const {
      time = 0,
      width,
      height,
      format = 'jpeg',
      quality = 0.8,
    } = options;

    console.log('[VideoSDK] Generating thumbnail at', time, 'seconds');

    const video = await this.loadVideoAtTime(source, time);

    // Calculate dimensions
    const targetWidth = width || video.videoWidth;
    const targetHeight = height || video.videoHeight;

    this.canvas.width = targetWidth;
    this.canvas.height = targetHeight;

    this.ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    // Cleanup
    if (video.src.startsWith('blob:')) {
      URL.revokeObjectURL(video.src);
    }

    return this.canvas.toDataURL(`image/${format}`, quality);
  }

  async generateThumbnails(
    count: number = 5,
  ): Promise<string[]> {
    const metadata = await this.getMetadata(source);
    const interval = metadata.duration / (count + 1);
    const thumbnails: string[] = [];

    for (let i = 1; i <= count; i++) {
      const time = interval * i;
      const thumbnail = await this.generateThumbnail(source, { ...options, time });
      thumbnails.push(thumbnail);
    }

    return thumbnails;
  }

  private loadVideoAtTime(source: File | Blob | string, time: number): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';

      video.onloadedmetadata = () => {
        video.currentTime = Math.min(time, video.duration);
      };

      video.onseeked = () => {
        resolve(video);
      };

      video.onerror = () => {
        reject(new Error('Failed to load video'));
      };

      if (typeof source === 'string') {
        video.src = source;
      } else {
        video.src = URL.createObjectURL(source);
      }
    });
  }

  // ===========================================================================
  // Video Compression
  // ===========================================================================

  async compress(
    onProgress?: (progress: ProcessingProgress) => void
  ): Promise<Blob> {
    const {
      maxWidth = 1280,
      maxHeight = 720,
      quality = 0.8,
      frameRate = 30,
      videoBitrate = 2500000, // 2.5 Mbps
    } = options;

    console.log('[VideoSDK] Compressing video with options:', options);
    onProgress?.({ stage: 'loading', progress: 0, message: 'Loading video...' });

    const video = await this.loadVideo(source);
    
    // Calculate output dimensions
    let outputWidth = video.videoWidth;
    let outputHeight = video.videoHeight;

    if (outputWidth > maxWidth) {
      const ratio = maxWidth / outputWidth;
      outputWidth = maxWidth;
      outputHeight = Math.round(outputHeight * ratio);
    }

    if (outputHeight > maxHeight) {
      const ratio = maxHeight / outputHeight;
      outputHeight = maxHeight;
      outputWidth = Math.round(outputWidth * ratio);
    }

    // Ensure even dimensions for video encoding
    outputWidth = Math.floor(outputWidth / 2) * 2;
    outputHeight = Math.floor(outputHeight / 2) * 2;

    console.log('[VideoSDK] Output dimensions:', outputWidth, 'x', outputHeight);

    this.canvas.width = outputWidth;
    this.canvas.height = outputHeight;

    onProgress?.({ stage: 'processing', progress: 20, message: 'Processing video...' });

    // Create MediaRecorder with canvas stream
    const stream = this.canvas.captureStream(frameRate);
    
    // Check if audio exists (with type assertions for vendor prefixes)
    const videoEl = video as any;
    const hasAudio = videoEl.mozHasAudio || 
                     videoEl.webkitAudioDecodedByteCount > 0 || 
                     videoEl.audioTracks?.length > 0;

    // Add audio track if available
    if (hasAudio) {
      try {
        const audioContext = new AudioContext();
        const audioSource = audioContext.createMediaElementSource(video);
        const audioDestination = audioContext.createMediaStreamDestination();
        audioSource.connect(audioDestination);
        audioDestination.stream.getAudioTracks().forEach(track => {
          stream.addTrack(track);
        });
      } catch (e) {
        console.warn('[VideoSDK] Could not process audio:', e);
      }
    }

    const mimeType = this.getSupportedMimeType();
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: videoBitrate,
    });

    const chunks: Blob[] = [];
    
    return new Promise((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        onProgress?.({ stage: 'complete', progress: 100, message: 'Complete!' });
        const blob = new Blob(chunks, { type: mimeType });
        
        // Cleanup
        if (video.src.startsWith('blob:')) {
          URL.revokeObjectURL(video.src);
        }
        
        console.log('[VideoSDK] Compression complete. Original:', source.size, 'Compressed:', blob.size);
        resolve(blob);
      };

      recorder.onerror = () => {
        reject(new Error('Video compression failed'));
      };

      recorder.start(100);

      // Process video frame by frame
      video.currentTime = 0;
      video.play().catch(console.error);

      const processFrame = () => {
        if (video.ended || video.paused) {
          recorder.stop();
          return;
        }

        this.ctx.drawImage(video, 0, 0, outputWidth, outputHeight);
        
        const progress = 20 + (video.currentTime / video.duration) * 70;
        onProgress?.({
          stage: 'encoding', 
          progress: Math.round(progress), 
          message: `Encoding... ${Math.round(video.currentTime)}/${Math.round(video.duration)}s`
        });

        requestAnimationFrame(processFrame);
      };

      video.onplay = () => {
        processFrame();
      };

      video.onended = () => {
        setTimeout(() => recorder.stop(), 100);
      };
    });
  }

  // ===========================================================================
  // Video Filters
  // ===========================================================================

  async applyFilter(
    filter: VideoFilter,
  ): Promise<Blob> {
    console.log('[VideoSDK] Applying filter:', filter.type);
    onProgress?.({ stage: 'loading', progress: 0, message: 'Loading video...' });

    const video = await this.loadVideo(source);
    
    this.canvas.width = video.videoWidth;
    this.canvas.height = video.videoHeight;

    const filterString = this.getFilterString(filter);
    
    onProgress?.({ stage: 'processing', progress: 20, message: 'Applying filter...' });

    const stream = this.canvas.captureStream(30);
    const mimeType = this.getSupportedMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });

    const chunks: Blob[] = [];

    return new Promise((resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        onProgress?.({ stage: 'complete', progress: 100, message: 'Complete!' });
        resolve(new Blob(chunks, { type: mimeType }));
      };

      recorder.onerror = () => reject(new Error('Failed to apply filter'));

      recorder.start(100);
      video.currentTime = 0;
      video.play();

      const processFrame = () => {
        if (video.ended) {
          recorder.stop();
          return;
        }

        this.ctx.filter = filterString;
        this.ctx.drawImage(video, 0, 0);
        this.ctx.filter = 'none';

        const progress = 20 + (video.currentTime / video.duration) * 70;
        onProgress?.({ stage: 'encoding', progress: Math.round(progress), message: 'Processing...' });

        requestAnimationFrame(processFrame);
      };

      video.onplay = processFrame;
      video.onended = () => setTimeout(() => recorder.stop(), 100);
    });
  }

  private getFilterString(filter: VideoFilter): string {
    const value = filter.value ?? 1;
    switch (filter.type) {
      case 'brightness': return `brightness(${value})`;
      case 'contrast': return `contrast(${value})`;
      case 'saturate': return `saturate(${value})`;
      case 'grayscale': return `grayscale(${value})`;
      case 'sepia': return `sepia(${value})`;
      case 'blur': return `blur(${value}px)`;
      default: return 'none';
    }
  }

  // ===========================================================================
  // Frame Extraction
  // ===========================================================================

  async extractFrames(
    frameRate: number = 1, // frames per second to extract
  ): Promise<string[]> {
    console.log('[VideoSDK] Extracting frames at', frameRate, 'fps');
    onProgress?.({ stage: 'loading', progress: 0, message: 'Extracting frames...' });

    const metadata = await this.getMetadata(source);
    const totalFrames = Math.floor(metadata.duration * frameRate);
    const frames: string[] = [];

    for (let i = 0; i < totalFrames; i++) {
      const time = i / frameRate;
      const frame = await this.generateThumbnail(source, { time, format: 'jpeg', quality: 0.9 });
      frames.push(frame);
      
      const progress = ((i + 1) / totalFrames) * 100;
      onProgress?.({ stage: 'processing', progress: Math.round(progress), message: `Frame ${i + 1}/${totalFrames}` });
    }

    onProgress?.({ stage: 'complete', progress: 100, message: 'Complete!' });
    return frames;
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return 'video/webm';
  }

  async createVideoFromFrames(
    frames: string[],
  ): Promise<Blob> {
    console.log('[VideoSDK] Creating video from', frames.length, 'frames');
    onProgress?.({ stage: 'loading', progress: 0, message: 'Creating video...' });

    if (frames.length === 0) {
      throw new Error('No frames found');
    }

    // Load first frame to get dimensions
    const firstImage = await this.loadImage(frames[0]);
    this.canvas.width = firstImage.width;
    this.canvas.height = firstImage.height;

    const stream = this.canvas.captureStream(frameRate);
    const mimeType = this.getSupportedMimeType();
    const recorder = new MediaRecorder(stream, { mimeType });

    const chunks: Blob[] = [];

    return new Promise(async (resolve, reject) => {
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        onProgress?.({ stage: 'complete', progress: 100, message: 'Complete!' });
        resolve(new Blob(chunks, { type: mimeType }));
      };

      recorder.onerror = () => reject(new Error('Failed to create video'));

      recorder.start();

      // Draw each frame
      for (let i = 0; i < frames.length; i++) {
        const image = await this.loadImage(frames[i]);
        this.ctx.drawImage(image, 0, 0);
        
        const progress = ((i + 1) / frames.length) * 90;
        onProgress?.({ stage: 'encoding', progress: Math.round(progress), message: `Frame ${i + 1}/${frames.length}` });

        // Wait for next frame timing
        await new Promise(r => setTimeout(r, 1000 / frameRate));
      }

      recorder.stop();
    });
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  cleanup(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.videoElement.src = '';
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

let videoSDKInstance: VideoProcessingSDK | null = null;

export function getVideoSDK(): VideoProcessingSDK {
  if (!videoSDKInstance) {
    videoSDKInstance = new VideoProcessingSDK();
  }
  return videoSDKInstance;
}
