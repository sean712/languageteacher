// Pronunciation audio (ROADMAP Workstream G). Ported from Sean's lexical2.0
// src/lib/audioPlayer.ts (proven in production) minus its auto-play queue —
// that was a Lexical conversation feature we don't need. Adds an in-session
// clip cache so repeat taps don't re-hit the TTS function.
import { supabase } from './supabase';

export interface AudioPlayerState {
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
}

type AudioStateCallback = (state: AudioPlayerState) => void;

class AudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private callbacks = new Set<AudioStateCallback>();
  private currentState: AudioPlayerState = {
    isPlaying: false,
    isLoading: false,
    error: null,
  };

  subscribe(callback: AudioStateCallback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private setState(newState: Partial<AudioPlayerState>) {
    this.currentState = { ...this.currentState, ...newState };
    this.callbacks.forEach((cb) => cb(this.currentState));
  }

  async playFromBase64(base64Data: string, contentType = 'audio/mpeg') {
    this.stop();
    this.setState({ isLoading: true, error: null });
    try {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([byteNumbers], { type: contentType });
      const audioUrl = URL.createObjectURL(blob);

      this.audio = new Audio(audioUrl);
      this.audio.preload = 'auto';
      this.audio.addEventListener('play', () => {
        this.setState({ isPlaying: true, isLoading: false });
      });
      this.audio.addEventListener('pause', () => {
        this.setState({ isPlaying: false });
      });
      this.audio.addEventListener('ended', () => {
        this.setState({ isPlaying: false });
        this.cleanup();
      });
      this.audio.addEventListener('error', () => {
        this.setState({ isPlaying: false, isLoading: false, error: 'Failed to play audio' });
        this.cleanup();
      });

      await this.audio.play();
    } catch (error) {
      this.setState({
        isPlaying: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to play audio',
      });
      throw error;
    }
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.cleanup();
    }
    this.setState({ isPlaying: false, isLoading: false });
  }

  getState(): AudioPlayerState {
    return { ...this.currentState };
  }

  // Revoke the object URL so repeated clips don't leak memory.
  private cleanup() {
    if (this.audio) {
      const audioUrl = this.audio.src;
      this.audio.remove();
      this.audio = null;
      if (audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
    }
  }
}

export const audioPlayer = new AudioPlayer();

// Client-side mirror of the tts function's language normaliser — used to
// decide whether to render a speaker button at all. Keep in sync with
// supabase/functions/tts/index.ts. Policy: any language with a Polly (or
// Abair) voice gets TTS; anything else just doesn't get a speaker button.
const SPEAKABLE: Record<string, true> = {
  welsh: true, cymraeg: true, cy: true,
  irish: true, gaeilge: true, ga: true,
  french: true, 'français': true, francais: true, fr: true,
  german: true, deutsch: true, de: true,
  spanish: true, 'español': true, espanol: true, es: true,
  italian: true, italiano: true, it: true,
  portuguese: true, 'português': true, pt: true,
  'brazilian portuguese': true, 'portuguese (brazilian)': true, 'pt-br': true,
  dutch: true, nederlands: true, nl: true,
  danish: true, dansk: true, da: true,
  finnish: true, suomi: true, fi: true,
  icelandic: true, 'íslenska': true, is: true,
  norwegian: true, norsk: true, no: true, nb: true,
  polish: true, polski: true, pl: true,
  swedish: true, svenska: true, sv: true,
  turkish: true, 'türkçe': true, tr: true,
  arabic: true, ar: true, arb: true,
  'mandarin chinese': true, mandarin: true, chinese: true, 'cmn-cn': true, zh: true,
  cantonese: true, yue: true,
  japanese: true, '日本語': true, ja: true,
  korean: true, '한국어': true, ko: true,
  hindi: true, hi: true,
  russian: true, ru: true,
  romanian: true, ro: true,
  czech: true, cs: true,
  catalan: true, 'català': true, ca: true,
  english: true, 'en-gb': true, 'en-us': true, en: true,
};

export function hasVoice(language: string | null | undefined): boolean {
  if (!language) return false;
  return SPEAKABLE[language.trim().toLowerCase()] === true;
}

// One clip per (language, text) per session — repeat taps are instant and
// don't re-hit Polly.
const clipCache = new Map<string, { audioData: string; contentType: string }>();

export async function playTextToSpeech(text: string, language: string): Promise<void> {
  const key = `${language}:${text}`;
  let clip = clipCache.get(key);
  if (!clip) {
    const { data, error } = await supabase.functions.invoke('tts', {
      body: { text, language },
    });
    const res = data as
      | { audioData: string; contentType: string; success: true }
      | { error: string; success: false }
      | null;
    if (error || !res || !res.success) {
      throw new Error(
        (res && 'error' in res && res.error) || error?.message || 'TTS request failed',
      );
    }
    clip = { audioData: res.audioData, contentType: res.contentType };
    clipCache.set(key, clip);
  }
  await audioPlayer.playFromBase64(clip.audioData, clip.contentType);
}
