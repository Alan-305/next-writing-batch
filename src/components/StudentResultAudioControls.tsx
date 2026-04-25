"use client";

import { useCallback, useRef } from "react";

type Props = { src: string };

export function StudentResultAudioControls({ src }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const onPlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    void a.play().catch(() => {});
  }, []);

  const onStop = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  }, []);

  if (!src.trim()) return null;

  return (
    <div className="student-result-audio-controls">
      <audio ref={audioRef} src={src.trim()} preload="metadata" />
      <button type="button" onClick={onPlay}>
        再生
      </button>
      <button type="button" onClick={onStop}>
        停止
      </button>
    </div>
  );
}
