import { NextRequest, NextResponse } from "next/server";
import { setWebhook, setMyCommands, setChatMenuButton } from "@/lib/services/telegram";
import { isAuthorizedCronRequest } from "@/lib/services/cron-utils";

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set" }, { status: 500 });
  }
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SECRET not set" }, { status: 500 });
  }

  const webhookResult = await setWebhook(`${baseUrl}/api/telegram`, webhookSecret);

  const commandsResult = await setMyCommands();
  const menuResult = await setChatMenuButton(`${baseUrl}/login`);

  return NextResponse.json({
    webhook: webhookResult,
    commands: commandsResult,
    menu: menuResult,
  });
}
