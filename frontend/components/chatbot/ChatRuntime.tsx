"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ExternalLink, RefreshCw, Send, Star } from "lucide-react";
import { SpaghettiMark } from "@/components/brand/SpaghettiMark";
import { RichText } from "@/components/content/RichText";
import { answerConversation, deploymentBootstrap, startDeployment, startPreview, startPublic } from "@/services/conversations";
import type { ConversationState, RuntimeNode } from "@/types/api";
import { bookAppointment, completeSandboxPayment, createPayment, getPaymentStatus, listAppointmentSlots, sendOtp, uploadConversationFile, verifyOtp, type AppointmentSlot } from "@/services/providers";

type ChatMessage = {
  id: string;
  sender: "bot" | "user";
  text: string;
  node?: RuntimeNode;
};

function stateLocale(locale?: string) {
  return locale || "en";
}

function linkActionHref(link: { url: string; link_type?: string }) {
  const destination = link.url.trim();
  if (!destination) return undefined;
  if (link.link_type === "email") return `mailto:${destination.replace(/^mailto:/i, "")}`;
  if (link.link_type === "phone") return `tel:${destination.replace(/^tel:/i, "")}`;
  if (link.link_type === "whatsapp" && !/^https?:\/\//i.test(destination)) {
    return `https://wa.me/${destination.replace(/\D/g, "")}`;
  }
  if (/^(https?:\/\/|mailto:|tel:)/i.test(destination)) return destination;
  return `https://${destination.replace(/^\/+/, "")}`;
}

export function ChatRuntime({ botId, identifier, deploymentKey, eligibilityToken, locale, title }: { botId?: string; identifier?: string; deploymentKey?: string; eligibilityToken?: string; locale?: string; title: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [node, setNode] = useState<RuntimeNode | null>(null);
  const [value, setValue] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");
  const [appearance, setAppearance] = useState<ConversationState["appearance"]>({});
  const [otpChallengeId, setOtpChallengeId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpDebugCode, setOtpDebugCode] = useState<string | null>(null);
  const automaticStartKey = useRef<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const begin = async () => {
    setBusy(true);
    setError("");
    setMessages([]);
    setNode(null);
    setValue("");
    setSelected([]);
    setSlots([]);
    setOtpChallengeId(null); setOtpCode(""); setOtpDebugCode(null);
    try {
      let token = eligibilityToken;
      if (deploymentKey && !token) {
        const bootstrap = await deploymentBootstrap(deploymentKey);
        if (!bootstrap.eligible || !bootstrap.eligibility_token) {
          throw new Error(bootstrap.reasons.join(". ") || "This chatbot is not available for this visit");
        }
        token = bootstrap.eligibility_token;
      }
      const state = botId ? await startPreview(botId, locale) : deploymentKey ? await startDeployment(deploymentKey, locale, token ?? "") : await startPublic(identifier ?? "", locale);
      setConversationId(state.conversation_id);
      applyState(state, []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start conversation");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const startKey = `${botId ? `preview:${botId}` : deploymentKey ? `deployment:${deploymentKey}:${eligibilityToken ?? "bootstrap"}` : `public:${identifier ?? ""}`}:${locale ?? "default"}`;
    if (automaticStartKey.current === startKey) return;
    automaticStartKey.current = startKey;
    void begin();
  }, [botId, deploymentKey, eligibilityToken, identifier, locale]);

  useEffect(() => {
    if (node?.type !== "appointment" || !conversationId) { setSlots([]); return; }
    listAppointmentSlots(conversationId, node.id).then(setSlots).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load appointment slots"));
  }, [conversationId, node?.id, node?.type]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const transcript = transcriptRef.current;
      if (!transcript) return;
      transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, node?.id, error]);

  const applyState = (state: ConversationState, prefix: ChatMessage[]) => {
    const botMessages: ChatMessage[] = state.messages.map((item) => ({
      id: `${item.id}-${crypto.randomUUID()}`,
      sender: "bot",
      text: String(item.data.label ?? ""),
      node: item,
    }));
    if (state.next_node) {
      botMessages.push({
        id: `${state.next_node.id}-${crypto.randomUUID()}`,
        sender: "bot",
        text: String(state.next_node.data.label ?? (state.status === "completed" ? "Conversation complete" : "Your answer")),
        node: state.next_node,
      });
    }
    setMessages((current) => [...current, ...prefix, ...botMessages]);
    setNode(state.status === "active" ? state.next_node : null);
    setDirection(state.direction ?? "ltr");
    setAppearance(state.appearance ?? {});
    if (typeof window !== "undefined" && window.parent !== window) {
      window.parent.postMessage({ type: "visual-chatbot:event", event: state.status === "completed" ? "completed" : "state", payload: { conversation_id: state.conversation_id, status: state.status, variables: state.variables } }, "*");
    }
  };

  const submit = async (answer: unknown, displayValue = String(answer)) => {
    if (!conversationId || !node) return;
    setBusy(true);
    setError("");
    try {
      const state = await answerConversation(conversationId, node.id, answer);
      applyState(state, [{ id: crypto.randomUUID(), sender: "user", text: displayValue }]);
      setValue("");
      setSelected([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit answer");
    } finally {
      setBusy(false);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !conversationId || !node) return;
    setBusy(true); setError("");
    try {
      const maximum = Number(node.data.max_files ?? 1);
      const chosen = Array.from(files).slice(0, maximum);
      const uploaded = await Promise.all(chosen.map((file) => uploadConversationFile(conversationId, node.id, file)));
      await submit(uploaded, uploaded.map((item) => item.name).join(", "));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "File upload failed"); }
    finally { setBusy(false); }
  };

  const pay = async () => {
    if (!conversationId || !node) return;
    setBusy(true); setError("");
    try {
      let payment = await createPayment(conversationId, node.id);
      if (payment.provider === "sandbox" && payment.action_url) payment = await completeSandboxPayment(payment.action_url);
      else if (payment.action_url && payment.status === "pending") {
        window.open(payment.action_url, "visual-chatbot-payment", "noopener,noreferrer");
        for (let attempt = 0; attempt < 45 && payment.status === "pending"; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
          payment = await getPaymentStatus(payment.payment_id);
        }
      }
      if (payment.status !== "paid") throw new Error("The provider has not confirmed this payment yet");
      await submit(payment, `${payment.currency} ${payment.amount.toFixed(2)} paid`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Payment failed"); }
    finally { setBusy(false); }
  };

  const reserve = async (slot: AppointmentSlot) => {
    if (!conversationId || !node) return;
    setBusy(true); setError("");
    try { const appointment = await bookAppointment(conversationId, node.id, slot.starts_at); await submit(appointment, new Date(appointment.starts_at).toLocaleString()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Appointment could not be booked"); }
    finally { setBusy(false); }
  };

  const requestPhoneCode = async () => {
    if (!conversationId || !node || !value) return;
    setBusy(true); setError("");
    try { const result = await sendOtp(conversationId, node.id, value); setOtpChallengeId(result.challenge_id); setOtpDebugCode(result.debug_code ?? null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not send verification code"); }
    finally { setBusy(false); }
  };

  const confirmPhoneCode = async () => {
    if (!otpChallengeId || !otpCode) return;
    setBusy(true); setError("");
    try { const result = await verifyOtp(otpChallengeId, otpCode); await submit({ challenge_id: result.challenge_id }, result.answer_value); setOtpChallengeId(null); setOtpCode(""); setOtpDebugCode(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Verification failed"); }
    finally { setBusy(false); }
  };

  const options = useMemo(() => node?.data.options ?? [], [node]);
  const optionValues = useMemo(
    () => node?.data.option_values?.length === options.length ? node.data.option_values : options,
    [node, options],
  );
  const minimum = Number(node?.data.min_value ?? (node?.type === "ratingInput" ? 1 : 0));
  const maximum = Number(node?.data.max_value ?? (node?.type === "ratingInput" ? 5 : 10));
  const scaleValues = useMemo(
    () => Array.from({ length: Math.max(0, Math.min(21, maximum - minimum + 1)) }, (_, index) => minimum + index),
    [maximum, minimum],
  );
  const chatStyle = {
    "--chat-primary": appearance.primary_color ?? "#7C3AED",
    "--chat-background": appearance.background_color ?? "#FFFFFF",
    "--chat-surface": appearance.surface_color ?? "#FFFFFF",
    "--chat-text": appearance.text_color ?? "#211D29",
  } as CSSProperties;

  return (
    <section className={`chat-shell chat-layout-${appearance.layout_style ?? "card"}`} dir={direction} lang={stateLocale(locale)} style={chatStyle}>
      <header className="chat-header">
        <span className="chat-profile-picture">
          {appearance.avatar_url ? <img src={appearance.avatar_url} alt="Chat profile" /> : <SpaghettiMark size={31} />}
        </span>
        <div><strong>{appearance.title || title}</strong><span>{appearance.description || (botId ? "Draft preview" : "Published chatbot")}</span></div>
        <button className="icon-button" type="button" aria-label="Restart" onClick={() => void begin()}><RefreshCw size={16} /></button>
      </header>
      <div ref={transcriptRef} className="chat-transcript" aria-live="polite">
        {busy && messages.length === 0 ? <p className="chat-placeholder">Starting conversation…</p> : null}
        {messages.map((message) => (
          <div className={`chat-bubble chat-bubble-${message.sender}`} key={message.id}>
            {message.sender === "bot" ? <RichText content={message.text} /> : <span>{message.text}</span>}
            {message.node?.type === "links" ? (
              <div className="chat-linked-actions">
                {message.node.data.links?.map((link) => (
                  <a
                    href={linkActionHref(link)}
                    key={`${link.link_type ?? "website"}-${link.label}-${link.url}`}
                    target={link.new_tab !== false ? "_blank" : undefined}
                    rel={link.new_tab !== false ? "noreferrer" : undefined}
                  >
                    {link.label || "Open link"}<ExternalLink size={13} />
                  </a>
                ))}
              </div>
            ) : null}
            {message.node?.type === "thankYou" && message.node.data.cta_url ? (
              <a className="chat-terminal-action" href={message.node.data.cta_url} target="_blank" rel="noreferrer">
                {message.node.data.cta_label || "Continue"}<ExternalLink size={13} />
              </a>
            ) : null}
            {message.node?.type === "whatsappRedirect" && message.node.data.whatsapp_phone ? (
              <a
                className="chat-terminal-action"
                href={`https://wa.me/${message.node.data.whatsapp_phone.replace(/\D/g, "")}?text=${encodeURIComponent(message.node.data.whatsapp_message ?? "")}`}
                target="_blank"
                rel="noreferrer"
              >
                Open WhatsApp<ExternalLink size={13} />
              </a>
            ) : null}
          </div>
        ))}
        {error ? <div className="chat-error">{error}</div> : null}
      </div>
      {node ? (
        <div className="chat-composer">
          {node.type === "singleChoice" || node.type === "choice" ? (
            <div className="chat-options">
              {options.map((option, index) => (
                <button disabled={busy} type="button" key={`${option}-${index}`} onClick={() => void submit(optionValues[index] ?? option, option)}>{option}</button>
              ))}
            </div>
          ) : node.type === "multipleChoice" ? (
            <div className="chat-multiple">
              {options.map((option, index) => {
                const storedValue = optionValues[index] ?? option;
                return (
                  <label key={`${option}-${index}`}>
                    <input
                      type="checkbox"
                      checked={selected.includes(storedValue)}
                      onChange={(event) => setSelected((items) => event.target.checked ? [...items, storedValue] : items.filter((item) => item !== storedValue))}
                    />
                    {option}
                  </label>
                );
              })}
              <button
                className="primary-button"
                disabled={busy || selected.length < Number(node.data.min_selections ?? (node.data.required === false ? 0 : 1)) || (node.data.max_selections != null && selected.length > Number(node.data.max_selections))}
                type="button"
                onClick={() => {
                  const labels = selected.map((item) => options[optionValues.indexOf(item)] ?? item);
                  void submit(selected, labels.join(", "));
                }}
              >
                Continue
              </button>
            </div>
          ) : node.type === "searchableList" ? (
            <form onSubmit={(event) => {
              event.preventDefault();
              const index = options.indexOf(value);
              if (index >= 0) void submit(optionValues[index] ?? value, value);
            }}>
              <input autoFocus list={`list-${node.id}`} required={node.data.required !== false} value={value} onChange={(event) => setValue(event.target.value)} placeholder="Search options…" />
              <datalist id={`list-${node.id}`}>{options.map((option) => <option value={option} key={option} />)}</datalist>
              <button className="primary-button" disabled={busy || !options.includes(value)} type="submit" aria-label="Choose option"><Send size={16} /></button>
            </form>
          ) : node.type === "ratingInput" || node.type === "opinionScale" ? (
            <div className={`chat-scale ${node.type === "ratingInput" ? "chat-rating" : ""}`}>
              {scaleValues.map((score) => (
                <button disabled={busy} type="button" key={score} onClick={() => void submit(score)}>
                  {node.type === "ratingInput" ? <><Star size={15} />{score}</> : score}
                </button>
              ))}
            </div>
          ) : node.type === "rangeInput" ? (
            <form className="chat-range" onSubmit={(event) => { event.preventDefault(); void submit(Number(value || minimum)); }}>
              <output>{value || minimum}</output>
              <input autoFocus type="range" min={minimum} max={maximum} step={Number(node.data.step ?? 1)} value={value || minimum} onChange={(event) => setValue(event.target.value)} />
              <button className="primary-button" disabled={busy} type="submit">Continue</button>
            </form>
          ) : node.type === "fileUpload" ? (
            <label className="chat-upload">Choose {Number(node.data.max_files ?? 1) > 1 ? "files" : "a file"}<input disabled={busy} type="file" multiple={Number(node.data.max_files ?? 1) > 1} accept={(node.data.file_types ?? []).join(",")} onChange={(event) => void uploadFiles(event.target.files)} /><small>Files are size checked, scanned, and stored behind signed downloads.</small></label>
          ) : node.type === "payment" ? (
            <button className="primary-button chat-provider-action" disabled={busy} type="button" onClick={() => void pay()}>Pay {String(node.data.currency ?? "USD")} {Number(node.data.amount ?? 0).toFixed(2)}</button>
          ) : node.type === "appointment" ? (
            <div className="chat-slots">{slots.length ? slots.slice(0, 12).map((slot) => <button disabled={busy} type="button" key={slot.starts_at} onClick={() => void reserve(slot)}><strong>{new Date(slot.starts_at).toLocaleDateString()}</strong><span>{new Date(slot.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></button>) : <p>Loading available times…</p>}</div>
          ) : node.type === "phoneInput" && node.data.otp_required ? (
            <div className="chat-otp">{otpChallengeId ? <><label>Verification code<input autoFocus inputMode="numeric" value={otpCode} onChange={(event) => setOtpCode(event.target.value)} placeholder="6-digit code" /></label>{otpDebugCode ? <small>Preview code: <strong>{otpDebugCode}</strong></small> : <small>Check your phone for the code.</small>}<button className="primary-button" disabled={busy || otpCode.length < 4} type="button" onClick={() => void confirmPhoneCode()}>Verify and continue</button><button className="secondary-button" type="button" onClick={() => { setOtpChallengeId(null); setOtpCode(""); }}>Change phone</button></> : <><label>Phone number<input autoFocus type="tel" value={value} onChange={(event) => setValue(event.target.value)} placeholder="+971…" /></label><button className="primary-button" disabled={busy || value.length < 7} type="button" onClick={() => void requestPhoneCode()}>Send verification code</button></>}</div>
          ) : (
            <form onSubmit={(event) => { event.preventDefault(); void submit(value); }}>
              <input
                autoFocus
                required={node.data.required !== false}
                type={node.type === "numberInput" ? "number" : node.type === "emailInput" ? "email" : node.type === "phoneInput" ? "tel" : node.type === "dateInput" ? "date" : "text"}
                min={node.type === "numberInput" ? node.data.min_value : node.type === "dateInput" ? node.data.min_date : undefined}
                max={node.type === "numberInput" ? node.data.max_value : node.type === "dateInput" ? node.data.max_date : undefined}
                step={node.type === "numberInput" ? node.data.step : undefined}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Type your answer…"
              />
              <button className="primary-button" disabled={busy} type="submit" aria-label="Send answer"><Send size={16} /></button>
            </form>
          )}
          {node.data.required === false ? (
            <button
              className="chat-skip-button"
              disabled={busy}
              type="button"
              onClick={() => void submit(null, "Skipped")}
            >
              Skip
            </button>
          ) : null}
        </div>
      ) : messages.length > 0 && !busy ? <div className="chat-complete">Conversation complete</div> : null}
    </section>
  );
}
