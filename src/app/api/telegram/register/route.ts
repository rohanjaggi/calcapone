import { NextRequest, NextResponse } from "next/server";
import { setWebhook, setMyCommands, setChatMenuButton } from "@/lib/services/telegram";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set" }, { status: 500 });
  }

  const webhookResult = await setWebhook(
    `${baseUrl}/api/telegram`,
    process.env.TELEGRAM_WEBHOOK_SECRET!
  );

  const commandsResult = await setMyCommands();
  const menuResult = await setChatMenuButton(baseUrl);

  return NextResponse.json({
    webhook: webhookResult,
    commands: commandsResult,
    menu: menuResult,
  });
}
