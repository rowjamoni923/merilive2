/**
 * Pkg264 — Contacts picker bridge (permission-free).
 *
 * No READ_CONTACTS permission needed. Opens the system contacts UI; user
 * picks ONE contact and we get name + phone for that single record.
 *
 * Usage:
 *   const c = await pickContact();
 *   if (!c.cancelled) {
 *     await shareInviteSms(c.phone, `Hey ${c.name}, join me on MeriLive!`);
 *   }
 *
 * Web fallback: prompts user to enter name+phone manually (no Contact
 * Picker API support outside Chrome on Android, and we already cover
 * Android natively).
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export interface PickedContact {
  cancelled: boolean;
  name: string;
  phone: string;
}

interface ContactsPickerShape {
  pickContact(): Promise<PickedContact>;
}

const ContactsPicker = registerPlugin<ContactsPickerShape>("ContactsPicker");

export function isContactsPickerNative(): boolean {
  return Capacitor.getPlatform() === "android";
}

export async function pickContact(): Promise<PickedContact> {
  if (isContactsPickerNative()) {
    try {
      return await ContactsPicker.pickContact();
    } catch {
      return { cancelled: true, name: "", phone: "" };
    }
  }

  // Web fallback — try the W3C Contact Picker API where supported (Chrome
  // Android only), otherwise return cancelled so the caller can render its
  // own manual-entry UI.
  try {
    const w = window as unknown as {
      contacts?: { select: (props: string[], opts?: { multiple?: boolean }) => Promise<Array<{ name?: string[]; tel?: string[] }>> };
    };
    if (w.contacts && typeof w.contacts.select === "function") {
      const list = await w.contacts.select(["name", "tel"], { multiple: false });
      if (!list || list.length === 0) return { cancelled: true, name: "", phone: "" };
      const c = list[0];
      return {
        cancelled: false,
        name: c.name?.[0] || "",
        phone: c.tel?.[0] || "",
      };
    }
  } catch {
    /* fall through */
  }
  return { cancelled: true, name: "", phone: "" };
}

/**
 * Convenience: open an SMS compose with prefilled body to the picked
 * contact. Works on both Android (sms:) and iOS Safari PWA.
 */
export function shareInviteSms(phone: string, message: string): void {
  if (!phone) return;
  const body = encodeURIComponent(message);
  // Android wants `?body=`, iOS wants `&body=`. The `?` form works for both.
  window.location.href = `sms:${phone}?body=${body}`;
}

/**
 * Convenience: open WhatsApp chat with prefilled text to the picked contact.
 * Falls back to wa.me if the app is not installed.
 */
export function shareInviteWhatsApp(phone: string, message: string): void {
  if (!phone) return;
  const clean = phone.replace(/[^0-9+]/g, "").replace(/^\+/, "");
  const text = encodeURIComponent(message);
  window.location.href = `https://wa.me/${clean}?text=${text}`;
}
