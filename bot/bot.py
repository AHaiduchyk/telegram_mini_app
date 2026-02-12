from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from telegram import BotCommand, InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo, MenuButtonWebApp, ReplyKeyboardRemove
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("qr_bot")

# File logging
log_dir = Path(__file__).resolve().parent.parent / "logs"
try:
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "qr_bot.log"
    if not any(
        isinstance(h, logging.FileHandler) and getattr(h, "baseFilename", "") == str(log_path)
        for h in logger.handlers
    ):
        file_handler = logging.FileHandler(log_path)
        file_handler.setLevel(logging.INFO)
        formatter = logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
except Exception:
    logger.exception("Failed to initialize bot file logging")

BOT_TOKEN = os.getenv("BOT_TOKEN")
MINIAPP_URL = os.getenv("MINIAPP_URL")
SUPPORT_ADMIN_ID = int(os.getenv("SUPPORT_ADMIN_ID", "442103350"))


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not BOT_TOKEN or not MINIAPP_URL:
        await update.message.reply_text("Bot configuration is missing. Contact the admin.")
        return
    if update.effective_chat:
        await context.bot.set_chat_menu_button(
            chat_id=update.effective_chat.id,
            menu_button=MenuButtonWebApp(text="Open App", web_app=WebAppInfo(url=MINIAPP_URL)),
        )
    keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton("Open App", web_app=WebAppInfo(url=MINIAPP_URL))]]
    )
    await update.message.reply_text(
        "Привіт! Це фінансовий бот до міні‑апки.\n"
        "Тут можна швидко перейти в застосунок, дізнатись про преміум та залишити фідбек.\n\n"
        "Натисни кнопку нижче, щоб відкрити міні‑апку.",
        reply_markup=keyboard,
    )
    hidden = await update.message.reply_text(
        "ok",
        reply_markup=ReplyKeyboardRemove(),
    )
    await context.bot.delete_message(chat_id=hidden.chat_id, message_id=hidden.message_id)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Доступні команди:\n"
        "/start — запуск та коротка інструкція\n"
        "/help — як користуватись ботом і міні‑апкою\n"
        "/open — відкрити міні‑апку\n"
        "/premium — інформація про преміум\n"
        "/support — описати проблему або запропонувати покращення\n\n"
        "Для повного керування фінансами використовуй міні‑апку."
    )
    hidden = await update.message.reply_text("ok", reply_markup=ReplyKeyboardRemove())
    await context.bot.delete_message(chat_id=hidden.chat_id, message_id=hidden.message_id)


async def open_app(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not MINIAPP_URL:
        await update.message.reply_text("Mini App URL is missing. Contact the admin.")
        return
    if update.effective_chat:
        await context.bot.set_chat_menu_button(
            chat_id=update.effective_chat.id,
            menu_button=MenuButtonWebApp(text="Open App", web_app=WebAppInfo(url=MINIAPP_URL)),
        )
    keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton("Open App", web_app=WebAppInfo(url=MINIAPP_URL))]]
    )
    await update.message.reply_text(
        "Відкриваю міні‑апку 👇",
        reply_markup=keyboard,
    )
    hidden = await update.message.reply_text("ok", reply_markup=ReplyKeyboardRemove())
    await context.bot.delete_message(chat_id=hidden.chat_id, message_id=hidden.message_id)


async def premium(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not MINIAPP_URL:
        await update.message.reply_text("Mini App URL is missing. Contact the admin.")
        return
    keyboard = InlineKeyboardMarkup(
        [[InlineKeyboardButton("Преміум", web_app=WebAppInfo(url=MINIAPP_URL))]]
    )
    await update.message.reply_text(
        "Преміум відкриває:\n"
        "• автоматичні транзакції\n"
        "• скан QR‑чеків\n\n"
        "Натисни кнопку нижче, щоб відкрити міні‑апку.",
        reply_markup=keyboard,
    )
    hidden = await update.message.reply_text("ok", reply_markup=ReplyKeyboardRemove())
    await context.bot.delete_message(chat_id=hidden.chat_id, message_id=hidden.message_id)


async def support(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    context.user_data["awaiting_support"] = True
    await update.message.reply_text(
        "Опиши проблему або запропонуй покращення — я передам команді."
    )
    hidden = await update.message.reply_text("ok", reply_markup=ReplyKeyboardRemove())
    await context.bot.delete_message(chat_id=hidden.chat_id, message_id=hidden.message_id)


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


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    if context.user_data.get("awaiting_support"):
        context.user_data["awaiting_support"] = False
        admin_id = SUPPORT_ADMIN_ID
        user = update.effective_user
        sender = user.username or f"{user.first_name or ''} {user.last_name or ''}".strip() or f"id:{user.id}"
        text = update.message.text or ""
        await context.bot.send_message(
            chat_id=admin_id,
            text=(
                "Support message:\n"
                f"From: {sender} (id: {user.id})\n"
                f"Text: {text}"
            ),
        )
        await update.message.reply_text(
            "Дякую! Передав команді. Якщо буде потрібно — ми звʼяжемось."
        )
        return


async def set_commands(application: Application) -> None:
    commands = [
        BotCommand("start", "Запуск та коротка інструкція"),
        BotCommand("help", "Як користуватись ботом і міні‑апкою"),
        BotCommand("open", "Відкрити міні‑апку"),
        BotCommand("premium", "Інформація про преміум"),
        BotCommand("support", "Підтримка та пропозиції"),
    ]
    await application.bot.set_my_commands(commands)


def main() -> None:
    if not BOT_TOKEN:
        raise RuntimeError("BOT_TOKEN is not set")
    application = Application.builder().token(BOT_TOKEN).build()
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("open", open_app))
    application.add_handler(CommandHandler("premium", premium))
    application.add_handler(CommandHandler("support", support))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_web_app_data))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    application.post_init = set_commands
    logger.info("Bot is starting...")
    application.run_polling()


if __name__ == "__main__":
    main()
