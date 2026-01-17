from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("qr_bot")

BOT_TOKEN = os.getenv("BOT_TOKEN")
MINIAPP_URL = os.getenv("MINIAPP_URL")


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not BOT_TOKEN or not MINIAPP_URL:
        await update.message.reply_text("Bot configuration is missing. Contact the admin.")
        return
    keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton("Open QR Scanner", web_app=WebAppInfo(url=MINIAPP_URL))]]
    )
    await update.message.reply_text(
        "Tap the button below to open the QR Scanner Mini App.",
        reply_markup=keyboard,
    )


async def handle_web_app_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    data = update.message.web_app_data.data
    safe_text = data.strip().replace("\n", " ")
    if len(safe_text) > 120:
        safe_text = f"{safe_text[:117]}..."
    await update.message.reply_text(
        f"Received QR text: {safe_text}",
    )


def main() -> None:
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN is not set")
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_web_app_data))
    logger.info("Bot is starting...")
    application.run_polling()


if __name__ == "__main__":
    main()
