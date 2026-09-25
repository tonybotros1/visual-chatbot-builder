type SpaghettiMarkProps = {
  className?: string;
  size?: number;
  title?: string;
};

export function SpaghettiMark({ className = "", size = 48, title = "Spaghetti" }: SpaghettiMarkProps) {
  return (
    <svg
      aria-label={title}
      className={className}
      height={size}
      role="img"
      viewBox="0 0 88 64"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="10" cy="19" fill="#E84A5F" r="7" />
      <path
        d="M10 19 31 7 24 35 48 21 38 53 58 39"
        fill="none"
        stroke="#E84A5F"
        strokeLinecap="round"
        strokeLinejoin="miter"
        strokeWidth="7"
      />
      <path d="M58 39 76 20" fill="none" stroke="#7C3AED" strokeLinecap="round" strokeWidth="6" />
      <path d="M58 39 78 46" fill="none" stroke="#7C3AED" strokeLinecap="round" strokeWidth="6" />
      <circle cx="58" cy="39" fill="#F5B942" r="8" />
      <circle cx="77" cy="19" fill="#7C3AED" r="8" />
      <circle cx="79" cy="47" fill="#38BDF8" r="8" />
    </svg>
  );
}
