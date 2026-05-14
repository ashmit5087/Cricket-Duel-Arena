import { useEffect, useRef } from "react";

interface VideoBackgroundProps {
  src: string;
  opacity?: number;
  overlayColor?: string;
  overlayOpacity?: number;
  className?: string;
}

export function VideoBackground({
  src,
  opacity = 0.5,
  overlayColor = "10,10,10",
  overlayOpacity = 0.58,
  className = "",
}: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hlsInstance: import("hls.js").default | null = null;
    let destroyed = false;

    const isHLS = src.includes(".m3u8");

    if (isHLS) {
      import("hls.js").then(({ default: Hls }) => {
        if (destroyed || !video) return;
        if (Hls.isSupported()) {
          hlsInstance = new Hls({ startLevel: -1, maxMaxBufferLength: 30, enableWorker: true });
          hlsInstance.loadSource(src);
          hlsInstance.attachMedia(video);
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = src;
          video.play().catch(() => {});
        }
      });
    } else {
      video.src = src;
      video.play().catch(() => {});
    }

    return () => {
      destroyed = true;
      hlsInstance?.destroy();
    };
  }, [src]);

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none select-none z-0 ${className}`} aria-hidden>
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity }}
      />
      <div
        className="absolute inset-0"
        style={{ background: `rgba(${overlayColor},${overlayOpacity})` }}
      />
    </div>
  );
}
