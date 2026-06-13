import { useEffect, useRef, useState } from 'react';
import './LevelUpFaq.css';

interface Props {
  question: string;
  answer: string;
  coinSrc: string;
  imageSrc?: string;
  imageAlt?: string;
}

export default function LevelUpFaq({
  question,
  answer,
  coinSrc,
  imageSrc,
  imageAlt = '',
}: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [particles, setParticles] = useState<number[]>([]);

  useEffect(() => {
    const audio = new Audio(coinSrc);
    audioRef.current = audio;
  }, [coinSrc]);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const handleToggle = () => {
      if (!details.open) return;
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      const id = Date.now();
      setParticles((prev) => [...prev, id]);
      setTimeout(
        () => setParticles((prev) => prev.filter((p) => p !== id)),
        1400,
      );
    };
    details.addEventListener('toggle', handleToggle);
    return () => details.removeEventListener('toggle', handleToggle);
  }, []);

  return (
    <>
      <details ref={detailsRef} className="faq-item">
        <summary className="faq-item__question">{question}</summary>
        {imageSrc ? (
          <div className="faq-item__body--images">
            <p className="faq-item__answer">{answer}</p>
            <div className="faq-item__images">
              <img
                className="level-up-faq__star"
                src={imageSrc}
                alt={imageAlt}
                loading="lazy"
              />
            </div>
          </div>
        ) : (
          <p className="faq-item__answer">{answer}</p>
        )}
      </details>
      {particles.map((id) => (
        <div key={id} className="level-up-particle" aria-hidden="true">
          +1
        </div>
      ))}
    </>
  );
}
