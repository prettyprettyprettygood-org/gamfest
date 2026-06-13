import { useEffect, useRef, useState } from 'react';
import './DialUpFaq.css';

interface Props {
  question: string;
  answer: string;
  audioSrc: string;
  imageSrc?: string;
  imageAlt?: string;
}

export default function DialUpFaq({
  question,
  answer,
  audioSrc,
  imageSrc,
  imageAlt = '',
}: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioDuration, setAudioDuration] = useState(19.3);
  const [autoPlayStarted, setAutoPlayStarted] = useState(false);
  const [imageLoadingStarted, setImageLoadingStarted] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    const audio = new Audio(audioSrc);
    audio.loop = false;
    audioRef.current = audio;
    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };
    const handleEnded = () => {
      setPlaying(false);
      setImageLoaded(true);
    };
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioSrc]);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;

    const handleToggle = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (details.open && !autoPlayStarted) {
        setAutoPlayStarted(true);
        setImageLoadingStarted(true);
        audio.play().catch(() => {});
        setPlaying(true);
      } else {
        audio.pause();
        setPlaying(false);
      }
    };

    details.addEventListener('toggle', handleToggle);
    return () => details.removeEventListener('toggle', handleToggle);
  }, [autoPlayStarted]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      if (audio.ended) {
        audio.currentTime = 0;
      }
      setImageLoadingStarted(true);
      audio.play().catch(() => {});
      setPlaying(true);
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !muted;
    setMuted(!muted);
  };

  const audioControls = (
    <div className="faq-audio-controls">
      <button
        type="button"
        className="faq-audio-btn"
        onClick={togglePlay}
        aria-label={playing ? 'Pause dial-up sound' : 'Play dial-up sound'}
      >
        <svg
          className="faq-audio-btn__icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {playing ? (
            <>
              <rect
                x="6"
                y="5"
                width="4"
                height="14"
                rx="1"
                fill="currentColor"
              />
              <rect
                x="14"
                y="5"
                width="4"
                height="14"
                rx="1"
                fill="currentColor"
              />
            </>
          ) : (
            <polygon points="5,3 19,12 5,21" fill="currentColor" />
          )}
        </svg>
        {playing ? 'Pause' : 'Play'}
      </button>
      <button
        type="button"
        className="faq-audio-btn"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute dial-up sound' : 'Mute dial-up sound'}
      >
        <svg
          className="faq-audio-btn__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {muted ? (
            <>
              <polygon
                points="11,5 6,9 2,9 2,15 6,15 11,19"
                fill="currentColor"
                stroke="none"
              />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </>
          ) : (
            <>
              <polygon
                points="11,5 6,9 2,9 2,15 6,15 11,19"
                fill="currentColor"
                stroke="none"
              />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </>
          )}
        </svg>
        {muted ? 'Unmute' : 'Mute'}
      </button>
    </div>
  );

  return (
    <details ref={detailsRef} className="faq-item">
      <summary className="faq-item__question">{question}</summary>
      {imageSrc ? (
        <div className="faq-item__body--images">
          <div>
            <p className="faq-item__answer">{answer}</p>
            {audioControls}
          </div>
          <div className="faq-item__images">
            <div className="dial-up-loader">
              <img
                className={`dial-up-loader__image${
                  imageLoadingStarted ? ' dial-up-loader__image--started' : ''
                }${!playing ? ' dial-up-loader__image--paused' : ''}${
                  imageLoaded ? ' dial-up-loader__image--loaded' : ''
                }`}
                src={imageSrc}
                alt={imageAlt}
                loading="lazy"
                onAnimationEnd={() => setImageLoaded(true)}
                style={
                  {
                    '--dial-up-load-duration': `${audioDuration}s`,
                  } as React.CSSProperties
                }
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="faq-item__answer">{answer}</p>
          {audioControls}
        </>
      )}
    </details>
  );
}
