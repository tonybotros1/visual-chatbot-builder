"use client";

import type { ReactNode } from "react";
import {
  AtSign,
  BookOpen,
  Facebook,
  Ghost,
  Globe,
  Headphones,
  HelpCircle,
  Instagram,
  Linkedin,
  Mail,
  MessageCircle,
  Music2,
  Palette,
  Phone,
  Pin,
  Rocket,
  Send,
  Slack,
  Twitch,
  Video,
  Youtube,
} from "lucide-react";

/** Brand colour and glyph for each link type a Links node can hold. */
const brands: Record<string, { color: string; icon: (size: number) => ReactNode; label: string }> = {
  website: { color: "#4B5563", label: "Website", icon: (size) => <Globe size={size} /> },
  email: { color: "#6B7280", label: "Email", icon: (size) => <Mail size={size} /> },
  phone: { color: "#10B981", label: "Phone", icon: (size) => <Phone size={size} /> },
  whatsapp: { color: "#25D366", label: "WhatsApp", icon: (size) => <WhatsAppGlyph size={size} /> },
  facebook: { color: "#1877F2", label: "Facebook", icon: (size) => <Facebook size={size} /> },
  instagram: { color: "#E1306C", label: "Instagram", icon: (size) => <Instagram size={size} /> },
  twitter: { color: "#111111", label: "X", icon: (size) => <XGlyph size={size} /> },
  threads: { color: "#111111", label: "Threads", icon: (size) => <AtSign size={size} /> },
  linkedin: { color: "#0A66C2", label: "LinkedIn", icon: (size) => <Linkedin size={size} /> },
  youtube: { color: "#FF0000", label: "YouTube", icon: (size) => <Youtube size={size} /> },
  tiktok: { color: "#111111", label: "TikTok", icon: (size) => <Music2 size={size} /> },
  telegram: { color: "#26A5E4", label: "Telegram", icon: (size) => <Send size={size} /> },
  snapchat: { color: "#FFFC00", label: "Snapchat", icon: (size) => <Ghost size={size} color="#111111" /> },
  pinterest: { color: "#E60023", label: "Pinterest", icon: (size) => <Pin size={size} /> },
  spotify: { color: "#1DB954", label: "Spotify", icon: (size) => <Headphones size={size} /> },
  soundcloud: { color: "#FF5500", label: "SoundCloud", icon: (size) => <Headphones size={size} /> },
  medium: { color: "#111111", label: "Medium", icon: (size) => <BookOpen size={size} /> },
  product_hunt: { color: "#DA552F", label: "Product Hunt", icon: (size) => <Rocket size={size} /> },
  slack: { color: "#4A154B", label: "Slack", icon: (size) => <Slack size={size} /> },
  skype: { color: "#00AFF0", label: "Skype", icon: (size) => <Video size={size} /> },
  twitch: { color: "#9146FF", label: "Twitch", icon: (size) => <Twitch size={size} /> },
  quora: { color: "#B92B27", label: "Quora", icon: (size) => <HelpCircle size={size} /> },
  deviantart: { color: "#05CC47", label: "DeviantArt", icon: (size) => <Palette size={size} /> },
  reach_at: { color: "#374151", label: "Reach.at", icon: (size) => <AtSign size={size} /> },
};

function WhatsAppGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2m0 1.67c4.54 0 8.24 3.7 8.24 8.24s-3.7 8.24-8.24 8.24c-1.5 0-2.97-.41-4.25-1.18l-.3-.18-3.12.82.83-3.04-.2-.32a8.2 8.2 0 0 1-1.26-4.34c0-4.54 3.7-8.24 8.24-8.24m-3.4 4.32c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.6c.12.17 1.77 2.7 4.29 3.79 2.09.9 2.52.72 2.97.68.46-.05 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.23-.17-.48-.29-.25-.12-1.47-.72-1.7-.8-.23-.09-.39-.13-.56.12-.17.25-.64.8-.78.97-.15.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.44.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42h-.48" />
    </svg>
  );
}

function XGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.1-6.7L5.4 22H2.3l7.6-8.7L2 2h6.7l4.6 6.1L18.9 2zm-1.1 18.2h1.7L7.3 3.7H5.5l12.3 16.5z" />
    </svg>
  );
}

export function linkBrandLabel(type?: string): string {
  return brands[type ?? "website"]?.label ?? brands.website.label;
}

/** The service's icon in its brand colour, as a small round badge. */
export function LinkIcon({ type, size = 16 }: { type?: string; size?: number }) {
  const brand = brands[type ?? "website"] ?? brands.website;
  return (
    <span className="link-brand-icon" style={{ background: brand.color, width: size + 10, height: size + 10 }} aria-hidden="true">
      {brand.icon(size)}
    </span>
  );
}
