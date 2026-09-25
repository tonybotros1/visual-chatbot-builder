import { apiFetch } from "./api";

export type UploadedFile = { file_id: string; name: string; type: string; size: number; scan_status: string; download_url: string };
export type PaymentResult = { payment_id: string; provider: string; status: string; amount: number; currency: string; action_url?: string | null };
export type AppointmentSlot = { starts_at: string; ends_at: string; timezone: string };
export type AppointmentResult = { appointment_id: string; provider: string; status: string; starts_at: string; ends_at: string; timezone: string };

export async function uploadConversationFile(conversationId: string, nodeId: string, file: File): Promise<UploadedFile> {
  const ticket = await apiFetch<{ upload_url: string; expires_in: number }>("/public/provider-actions/files/initiate", {
    method: "POST",
    body: JSON.stringify({ conversation_id: conversationId, node_id: nodeId, name: file.name, type: file.type || "application/octet-stream", size: file.size }),
  });
  const response = await fetch(ticket.upload_url, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `Upload failed (${response.status})`);
  }
  return response.json() as Promise<UploadedFile>;
}

export const createPayment = (conversationId: string, nodeId: string) => apiFetch<PaymentResult>("/public/provider-actions/payments", { method: "POST", body: JSON.stringify({ conversation_id: conversationId, node_id: nodeId }) });
export const getPaymentStatus = (paymentId: string) => apiFetch<PaymentResult>(`/public/provider-actions/payments/${paymentId}`);
export async function completeSandboxPayment(actionUrl: string): Promise<PaymentResult> {
  const response = await fetch(actionUrl, { method: "POST" });
  if (!response.ok) throw new Error(`Sandbox payment failed (${response.status})`);
  return response.json() as Promise<PaymentResult>;
}
export const listAppointmentSlots = (conversationId: string, nodeId: string) => apiFetch<AppointmentSlot[]>("/public/provider-actions/appointments/slots", { method: "POST", body: JSON.stringify({ conversation_id: conversationId, node_id: nodeId }) });
export const bookAppointment = (conversationId: string, nodeId: string, startsAt: string) => apiFetch<AppointmentResult>("/public/provider-actions/appointments/book", { method: "POST", body: JSON.stringify({ conversation_id: conversationId, node_id: nodeId, starts_at: startsAt, metadata: {} }) });
export const sendOtp = (conversationId: string, nodeId: string, phone: string) => apiFetch<{ challenge_id: string; expires_in: number; debug_code?: string | null }>("/public/provider-actions/otp/send", { method: "POST", body: JSON.stringify({ conversation_id: conversationId, node_id: nodeId, phone }) });
export const verifyOtp = (challengeId: string, code: string) => apiFetch<{ challenge_id: string; verified: boolean; answer_value: string }>("/public/provider-actions/otp/verify", { method: "POST", body: JSON.stringify({ challenge_id: challengeId, code }) });
