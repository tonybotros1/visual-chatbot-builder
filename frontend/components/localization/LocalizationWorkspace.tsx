"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, Languages, Plus, Save, Trash2 } from "lucide-react";
import { getBot } from "@/services/bots";
import { confirmDialog } from "@/stores/dialog-store";
import { createLocale, deleteLocale, listLocales, updateLocale } from "@/services/localization";
import type { BotLocale } from "@/types/api";


export function LocalizationWorkspace({ botId }: { botId: string }) {
  const router = useRouter();
  const [botName, setBotName] = useState("Localization");
  const [items, setItems] = useState<BotLocale[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locale, setLocale] = useState("ar");
  const [name, setName] = useState("Arabic");
  const [direction, setDirection] = useState<"ltr" | "rtl">("rtl");
  const [translations, setTranslations] = useState('{}');
  const [error, setError] = useState("");
  const selected = items.find((item) => item.id === selectedId) ?? null;

  const load = useCallback(async () => {
    try { const [bot, locales] = await Promise.all([getBot(botId), listLocales(botId)]); setBotName(bot.name); setItems(locales); setSelectedId((current) => current ?? locales[0]?.id ?? null); }
    catch (caught) { if (caught && typeof caught === "object" && "status" in caught && caught.status === 401) router.replace("/login"); else setError(caught instanceof Error ? caught.message : "Could not load locales"); }
  }, [botId, router]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selected) { setLocale(selected.locale); setName(selected.name); setDirection(selected.direction); setTranslations(JSON.stringify(selected.translations, null, 2)); } }, [selectedId, selected]);

  const add = async () => {
    try { const item = await createLocale(botId, { locale, name, direction, translations: JSON.parse(translations), is_default: false }); setItems((records) => [...records, item]); setSelectedId(item.id); }
    catch (caught) { setError(caught instanceof SyntaxError ? "Translations contain invalid JSON" : caught instanceof Error ? caught.message : "Could not create locale"); }
  };
  const save = async () => {
    if (!selected) return;
    try { const item = await updateLocale(botId, selected.id, { name, direction, translations: JSON.parse(translations) }); setItems((records) => records.map((record) => record.id === item.id ? item : record)); }
    catch (caught) { setError(caught instanceof SyntaxError ? "Translations contain invalid JSON" : caught instanceof Error ? caught.message : "Could not save locale"); }
  };

  return <main className="localization-page">
    <header className="localization-header"><div className="builder-brand"><Link className="icon-button" href={`/bots/${botId}/builder`}><ChevronLeft size={19} /></Link><div><strong>{botName}</strong><span>Translated node content and RTL runtime</span></div></div></header>
    {error ? <div className="form-error">{error}</div> : null}
    <div className="localization-layout">
      <aside className="locale-list"><button className="secondary-button" type="button" onClick={() => { setSelectedId(null); setLocale("fr"); setName("French"); setDirection("ltr"); setTranslations('{}'); }}><Plus size={14} /> New locale</button>{items.map((item) => <button type="button" className={selectedId === item.id ? "selected" : ""} key={item.id} onClick={() => setSelectedId(item.id)}><Languages size={15} /><span><strong>{item.name}</strong><small>{item.locale} · {item.direction}</small></span>{item.is_default ? <Check size={14} /> : null}</button>)}</aside>
      <section className="localization-card">
        <div><p className="eyebrow">{selected ? "Edit locale" : "New locale"}</p><h2>{selected?.name ?? "Translation catalog"}</h2></div>
        <div className="localization-fields"><label>Locale code<input disabled={Boolean(selected)} value={locale} onChange={(event) => setLocale(event.target.value)} placeholder="ar-AE" /></label><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Direction<select value={direction} onChange={(event) => setDirection(event.target.value as "ltr" | "rtl")}><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></label></div>
        <p className="locale-help">Use keys such as <code>node-id.label</code>, <code>node-id.option.0</code>, and <code>node-id.cta_label</code>. Missing keys safely fall back to the original flow text. Visitors see the flow's original language unless a locale is marked as the default or requested with <code>?locale=</code>.</p>
        <label>Translations JSON<textarea spellCheck={false} dir={direction} value={translations} onChange={(event) => setTranslations(event.target.value)} /></label>
        <div className="localization-actions">{selected ? <><button className="primary-button" type="button" onClick={() => void save()}><Save size={14} /> Save</button>{selected.is_default ? <button className="secondary-button" type="button" onClick={() => void updateLocale(botId, selected.id, { is_default: false }).then(() => load())}><Languages size={14} /> Use original language by default</button> : <button className="secondary-button" type="button" onClick={() => void updateLocale(botId, selected.id, { is_default: true }).then(() => load())}><Check size={14} /> Make default</button>}<button className="secondary-button" type="button" onClick={() => void confirmDialog({ title: `Delete locale “${selected.name}”?`, message: "Its translation catalog is removed and visitors who request this locale see the original language.", confirmLabel: "Delete locale", tone: "danger" }).then((ok) => { if (ok) void deleteLocale(botId, selected.id).then(() => { setItems((records) => records.filter((record) => record.id !== selected.id)); setSelectedId(null); }); })}><Trash2 size={14} /> Delete</button></> : <button className="primary-button" type="button" onClick={() => void add()}><Plus size={14} /> Add locale</button>}</div>
      </section>
    </div>
  </main>;
}
