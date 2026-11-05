import { z } from "zod";

/** Strip control chars (keeps \n and \t), collapse CR, trim. */
export const clean = (s) =>
  String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();

const text = (max, min = 0) => z.string().transform(clean).pipe(z.string().min(min).max(max));
/** Single-line text: also forbids newlines, which blocks email-header injection. */
const line = (max, min = 0) =>
  z.string().transform((s) => clean(s).replace(/\s*\n+\s*/g, " ")).pipe(z.string().min(min).max(max));

export const TOPICS = ["hiring", "project", "collaboration", "question", "callback"];

export const contactSchema = z.object({
  name: line(100, 2),
  email: z.string().transform(clean).pipe(z.email().max(200)),
  phone: line(40).optional().default(""),
  company: line(120).optional().default(""),
  topic: z.enum(TOPICS).default("hiring"),
  preferredTime: line(120).optional().default(""),
  message: text(5000, 10),
  brief: text(8000).optional().default(""),
  website: z.string().optional().default(""), // honeypot: real users never fill this
  startedAt: z.number().optional()           // ms epoch when the form was rendered (time-trap)
});

const chatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: text(4000, 1)
});

export const chatSchema = z.object({
  messages: z.array(chatMessage).min(1).max(12)
});

export const fitSchema = z.object({ jobDescription: text(9000, 40) });
export const discoverSchema = z.object({
  description: text(3000, 20),
  industry: line(100).optional().default("")
});

export const flattenErrors = (err) => {
  const out = {};
  for (const issue of err.issues) out[issue.path.join(".") || "_"] = issue.message;
  return out;
};
