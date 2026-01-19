import time
from pathlib import Path
from seleniumbase import SB
from selenium.webdriver.common.action_chains import ActionChains

URL = "https://cabinet.tax.gov.ua/cashregs/check?fn=4000903762&id=3135993637&sm=65.48&time=190058&date=20241002"


def newest_file(folder: Path) -> Path | None:
    files = [p for p in folder.glob("*") if p.is_file()]
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)


def wait_new_file(folder: Path, before_ts: float, timeout: int = 30) -> Path | None:
    end = time.time() + timeout
    while time.time() < end:
        f = newest_file(folder)
        if f and f.stat().st_mtime > before_ts and f.suffix.lower() == ".xml":
            return f
        time.sleep(0.3)
    return None


def main():
    download_dir = Path.cwd() / "downloads"
    download_dir.mkdir(parents=True, exist_ok=True)

    # ВАЖЛИВО: не headless (бо хочемо бачити що відбувається)
    with SB(uc=True, headless=False) as sb:
        # Дозволяємо download в конкретну папку
        sb.driver.execute_cdp_cmd(
            "Page.setDownloadBehavior",
            {"behavior": "allow", "downloadPath": str(download_dir.resolve())},
        )

        sb.uc_open_with_reconnect(URL, 3)
        print("✅ Відкрив сторінку")
        print("👉 Якщо зʼявиться капча — зачекай, вона часто проходиться сама.")

        # Стабільний селектор по тексту
        xml_btn_xpath = "//button[.//span[normalize-space()='XML']]"
        sb.wait_for_element(xml_btn_xpath, timeout=300)

        before = time.time()
        print("✅ Тисну XML...")

        # SeleniumBase: знайти елемент, проскролити по селектору
        sb.scroll_to(xml_btn_xpath)

        # Забираємо WebElement і клікаємо через ActionChains (реальний клік)
        el = sb.find_element(xml_btn_xpath)
        ActionChains(sb.driver).move_to_element(el).pause(0.2).click(el).perform()

        # Ловимо .xml файл у downloads
        xml_file = wait_new_file(download_dir, before_ts=before, timeout=30)

        if not xml_file:
            print("❌ XML файл не зловив за 30с.")
            print("👉 Спробуй ще раз вручну натиснути XML у відкритому браузері.")
            sb.sleep(999999)
            return

        print(f"✅ Знайшов XML файл: {xml_file}")

        xml_text = xml_file.read_text(encoding="utf-8", errors="replace")
        print("\n========== XML (first 4000 chars) ==========\n")
        print(xml_text[:4000])
        print("\n===========================================\n")

        sb.sleep(999999)


if __name__ == "__main__":
    main()