import { createHmac } from "node:crypto";
import { webhookEvents } from "@giromesa/db";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { DatabaseService } from "../modules/database/database.service";
import { createEmailProvider, type EmailMessage } from "./email-provider";

export class EmailSuppressedError extends Error {
  readonly code = "EMAIL_RECIPIENT_SUPPRESSED";
}

export function emailSuppressionKey(recipient: string) {
  const pepper = process.env.PASSWORD_PEPPER;
  if (!pepper) throw new Error("PASSWORD_PEPPER is required for email suppression");
  return createHmac("sha256", pepper).update(recipient.trim().toLowerCase()).digest("hex");
}

export async function sendEmail(database: DatabaseService, message: EmailMessage) {
  const suppressionKey = emailSuppressionKey(message.to);
  const scope = message.tenantId
    ? or(isNull(webhookEvents.tenantId), eq(webhookEvents.tenantId, message.tenantId))
    : isNull(webhookEvents.tenantId);
  return database.db.transaction(async (tx) => {
    // Suppression writes use this same recipient-scoped lock. Holding it through
    // provider dispatch closes the race between a Resend complaint and a send.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${suppressionKey}))`);
    const [suppression] = await tx
      .select({ id: webhookEvents.id })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.provider, "resend"),
          eq(webhookEvents.status, "suppressed"),
          scope,
          sql`${webhookEvents.payload}->>'suppressionKey' = ${suppressionKey}`,
        ),
      )
      .limit(1);
    if (suppression) throw new EmailSuppressedError("Email recipient is suppressed");
    return createEmailProvider().send(message);
  });
}
