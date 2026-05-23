/**
 * Pkg263 — Calendar add-event bridge.
 *
 * Permission-free: opens the user's calendar app with a pre-filled event.
 * No READ_/WRITE_CALENDAR needed — user explicitly taps Save.
 *
 * Usage:
 *   await addCalendarEvent({
 *     title: 'Ananya goes live!',
 *     description: 'Tap to join the live show',
 *     location: 'https://merilive.com/live/xxx',
 *     beginTime: Date.now() + 2 * 60 * 60 * 1000, // 2h from now
 *     endTime:   Date.now() + 3 * 60 * 60 * 1000,
 *     reminderMinutes: 15,
 *   });
 *
 * Web fallback: generates a downloadable .ics file (RFC 5545) that Google
 * Calendar, Apple Calendar, and Outlook all import.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

export interface CalendarEventOptions {
  title: string;
  beginTime: number; // epoch ms
  endTime?: number;  // epoch ms — defaults to beginTime + 1h
  description?: string;
  location?: string;
  allDay?: boolean;
  reminderMinutes?: number;
}

interface CalendarBridgeShape {
  isAvailable(): Promise<{ available: boolean }>;
  addEvent(opts: CalendarEventOptions): Promise<{ launched: boolean }>;
}

const CalendarBridge = registerPlugin<CalendarBridgeShape>("CalendarBridge");

export function isCalendarBridgeNative(): boolean {
  return Capacitor.getPlatform() === "android";
}

export async function isCalendarAvailable(): Promise<boolean> {
  if (isCalendarBridgeNative()) {
    try {
      const r = await CalendarBridge.isAvailable();
      return !!r.available;
    } catch {
      return false;
    }
  }
  return typeof window !== "undefined";
}

function pad(n: number): string {
  return n < 10 ? "0" + n : "" + n;
}

function toIcsDate(ms: number): string {
  const d = new Date(ms);
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeIcs(s: string): string {
  return (s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export async function addCalendarEvent(opts: CalendarEventOptions): Promise<{ launched: boolean }> {
  const endTime = opts.endTime ?? opts.beginTime + 60 * 60 * 1000;

  if (isCalendarBridgeNative()) {
    return CalendarBridge.addEvent({
      title: opts.title,
      beginTime: opts.beginTime,
      endTime,
      description: opts.description || "",
      location: opts.location || "",
      allDay: !!opts.allDay,
      reminderMinutes: opts.reminderMinutes ?? 15,
    });
  }

  // Web fallback — download .ics
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@merilive`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MeriLive//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(Date.now())}`,
    `DTSTART:${toIcsDate(opts.beginTime)}`,
    `DTEND:${toIcsDate(endTime)}`,
    `SUMMARY:${escapeIcs(opts.title)}`,
    `DESCRIPTION:${escapeIcs(opts.description || "")}`,
    `LOCATION:${escapeIcs(opts.location || "")}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs(opts.title)}`,
    `TRIGGER:-PT${opts.reminderMinutes ?? 15}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  try {
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${opts.title.replace(/[^a-z0-9-_]+/gi, "_")}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch {}
    }, 1000);
    return { launched: true };
  } catch (e) {
    return { launched: false };
  }
}
