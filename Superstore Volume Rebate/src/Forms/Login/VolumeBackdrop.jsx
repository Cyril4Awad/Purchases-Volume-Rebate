import React from "react";

/*
 * Login background from the reference project: purchase volume columns climbing across
 * rebate tiers. Purely decorative SVG, so it stays crisp at any size.
 */
export default function VolumeBackdrop() {
    const bars = [18, 24, 21, 30, 27, 36, 33, 42, 39, 50, 46, 57, 54, 63, 60, 70, 67, 76, 73, 82];
    const tiers = [
        { y: 70, label: '1%' },
        { y: 48, label: '2.5%' },
        { y: 26, label: '4%' },
    ];
    return (
        <svg className="lg-backdrop" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
            <defs>
                <linearGradient id="lg-sky" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#0b1a3f" />
                    <stop offset="0.55" stopColor="#10306f" />
                    <stop offset="1" stopColor="#155dfc" />
                </linearGradient>
                <linearGradient id="lg-bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
                    <stop offset="1" stopColor="#ffffff" stopOpacity="0.03" />
                </linearGradient>
                <pattern id="lg-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                    <path d="M48 0H0V48" fill="none" stroke="#ffffff" strokeOpacity="0.05" />
                </pattern>
            </defs>
            <rect width="1440" height="900" fill="url(#lg-sky)" />
            <rect width="1440" height="900" fill="url(#lg-grid)" />

            {/* volume columns */}
            {bars.map((h, i) => {
                const x = 40 + i * 70;
                const height = (h / 100) * 900;
                return <rect key={i} x={x} y={900 - height} width="44" height={height} rx="6" fill="url(#lg-bar)" />;
            })}

            {/* rebate tier thresholds */}
            {tiers.map((t) => {
                const y = (t.y / 100) * 900;
                return (
                    <g key={t.label}>
                        <line x1="0" x2="1440" y1={y} y2={y} stroke="#8ec5ff" strokeOpacity="0.35" strokeDasharray="6 10" />
                        <rect x="1340" y={y - 15} width="72" height="30" rx="15" fill="#8ec5ff" fillOpacity="0.16" />
                        <text x="1376" y={y + 5} textAnchor="middle" fill="#dbeafe" fontSize="14" fontWeight="700" fontFamily="Segoe UI, system-ui, sans-serif">
                            {t.label}
                        </text>
                    </g>
                );
            })}

            {/* trend */}
            <polyline
                fill="none"
                stroke="#51a2ff"
                strokeWidth="3"
                strokeOpacity="0.8"
                strokeLinejoin="round"
                points={bars.map((h, i) => `${62 + i * 70},${900 - (h / 100) * 900 - 12}`).join(' ')}
            />
            {bars.map((h, i) => (i % 3 === 2 ? (
                <circle key={i} cx={62 + i * 70} cy={900 - (h / 100) * 900 - 12} r="5" fill="#ffffff" fillOpacity="0.85" />
            ) : null))}
        </svg>
    );
}
