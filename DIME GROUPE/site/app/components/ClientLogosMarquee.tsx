"use client";

import Image from "next/image";
import { useRef } from "react";

interface ClientLogo {
  id: string;
  name: string;
  logo_url?: string;
  website_url?: string;
  logo_height?: number;
  bg_white?: boolean;
}

interface Props {
  logos: ClientLogo[];
  globalHeight?: number;
}

function LogoItem({ logo, h }: { logo: ClientLogo; h: number }) {
  const bgStyle = logo.bg_white
    ? { background: "#ffffff", borderRadius: 8, padding: "6px 10px" }
    : {};

  const inner = logo.logo_url ? (
    <Image
      src={logo.logo_url}
      alt={logo.name}
      width={h * 4}
      height={h}
      style={{ height: h, width: "auto", maxWidth: h * 4, ...bgStyle }}
      className="object-contain transition-all duration-300 grayscale group-hover:grayscale-0 opacity-60 group-hover:opacity-100"
    />
  ) : (
    <span className="text-xs font-semibold opacity-50 group-hover:opacity-80 transition-opacity whitespace-nowrap">
      {logo.name}
    </span>
  );

  const cls = "group flex items-center justify-center px-5 py-3 rounded-xl border border-white/0 hover:border-white/10 hover:bg-white/5 transition-all duration-300 min-w-[80px]";

  if (logo.website_url) {
    return (
      <a href={logo.website_url} target="_blank" rel="noopener noreferrer" title={logo.name} className={cls}>
        {inner}
      </a>
    );
  }

  return <div title={logo.name} className={cls}>{inner}</div>;
}

export default function ClientLogosMarquee({ logos, globalHeight = 36 }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  if (logos.length === 0) return null;

  // Duplique pour l'effet infini
  const items = logos.length < 5 ? [...logos, ...logos, ...logos] : [...logos, ...logos];

  return (
    <div className="mt-4">
      {/* Conteneur masqué avec fade sur les bords */}
      <div
        className="relative overflow-hidden"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
        }}
      >
        {/* Track animé */}
        <div
          ref={trackRef}
          className="flex items-center gap-2"
          style={{ animation: "marquee 28s linear infinite" }}
          onMouseEnter={() => {
            if (trackRef.current) trackRef.current.style.animationPlayState = "paused";
          }}
          onMouseLeave={() => {
            if (trackRef.current) trackRef.current.style.animationPlayState = "running";
          }}
        >
          {items.map((logo, i) => (
            <LogoItem key={`${logo.id}-${i}`} logo={logo} h={globalHeight} />
          ))}
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
