#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import re
import sys
from urllib.parse import urlparse


def fail(message: str):
    print(json.dumps({"status": "error", "ok": False, "message": message}, ensure_ascii=False))
    sys.exit(0)


def normalize_tokens(raw: str):
    return [x.strip().lower() for x in (raw or "").split(",") if x.strip()]


def basename_from_url(v: str) -> str:
    if not v:
        return ""
    b = v.strip().lower().split("?")[0]
    if "/" in b:
        b = b.rsplit("/", 1)[-1]
    return b.strip()


def is_naver_dynamic_shell(final_url: str, html: str) -> bool:
    try:
        p = urlparse(final_url)
        host = (p.hostname or "").lower()
        if host not in ("cafe.naver.com", "m.cafe.naver.com"):
            return False
        path = (p.path or "").strip("/").lower()
        article_path = bool(re.match(r"^[^/]+/\d+$", path))
        q = p.query or ""
        article_query = ("articleid=" in q.lower()) or ("art=" in q.lower())
        if not article_path and not article_query:
            return False
        lower_html = (html or "").lower()
        if '<div id="app"></div>' in lower_html and "네이버 카페" in (html or ""):
            return True
        if "doesn't work properly without javascript enabled" in lower_html:
            return True
        return True
    except Exception:
        return False


def main():
    if len(sys.argv) < 6:
        fail("invalid arguments")

    target_url = sys.argv[1].strip()
    title = sys.argv[2].strip()
    author = sys.argv[3].strip()
    required_text = sys.argv[4].strip()
    required_image = sys.argv[5].strip()

    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        fail("playwright not installed")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                ),
                locale="ko-KR",
            )
            page = context.new_page()
            # Speed up verification by dropping heavy resources.
            def _route_handler(route):
                try:
                    rtype = route.request.resource_type
                    if rtype in ("media", "font"):
                        route.abort()
                        return
                    route.continue_()
                except Exception:
                    try:
                        route.continue_()
                    except Exception:
                        pass

            page.route("**/*", _route_handler)

            page.goto(target_url, wait_until="domcontentloaded", timeout=12000)
            try:
                # Keep short settle window; do not wait full network idle.
                page.wait_for_timeout(1200)
            except Exception:
                pass

            final_url = page.url
            html_parts = []
            body_parts = []

            # Collect top document and all frames (Naver Cafe article content is often in iframe).
            for frame in page.frames:
                try:
                    h = frame.content() or ""
                    if h:
                        html_parts.append(h)
                except Exception:
                    pass
                try:
                    t = frame.inner_text("body") or ""
                    if t:
                        body_parts.append(t)
                except Exception:
                    pass

            html = "\n".join(html_parts)
            body_text = "\n".join(body_parts)

            meta_texts = []
            meta_images = []
            for m in page.query_selector_all("meta[property], meta[name]"):
                k = (m.get_attribute("property") or m.get_attribute("name") or "").strip().lower()
                v = (m.get_attribute("content") or "").strip()
                if not k or not v:
                    continue
                if k in ("og:title", "og:description", "twitter:title", "twitter:description"):
                    meta_texts.append(v)
                if k in ("og:image", "twitter:image"):
                    meta_images.append(v)

            image_candidates = []
            for frame in page.frames:
                try:
                    imgs = frame.query_selector_all("img")
                except Exception:
                    imgs = []
                for img in imgs:
                    for attr in ("src", "data-src", "data-original", "data-lazy-src"):
                        v = (img.get_attribute(attr) or "").strip()
                        if v:
                            image_candidates.append(v)
                    for attr in ("srcset", "data-srcset"):
                        s = (img.get_attribute(attr) or "").strip()
                        if not s:
                            continue
                        for part in s.split(","):
                            part = part.strip()
                            if not part:
                                continue
                            first = part.split(" ")[0].strip()
                            if first:
                                image_candidates.append(first)

            seen = set()
            merged_images = []
            for x in (meta_images + image_candidates):
                k = (x or "").strip().lower()
                if not k or k in seen:
                    continue
                seen.add(k)
                merged_images.append(x.strip())

            text_haystack = " ".join([html, body_text] + meta_texts).lower()
            title_norm = title.lower().strip()
            author_norm = author.lower().strip()
            has_text = (title_norm and title_norm in text_haystack) or (author_norm and author_norm in text_haystack)

            req_text = required_text.lower().strip()
            req_img = required_image.lower().strip()

            text_ok = True
            if req_text:
                for tk in normalize_tokens(req_text):
                    if tk not in text_haystack:
                        text_ok = False
                        break

            image_ok = True
            if req_img:
                image_ok = False
                req_base = basename_from_url(req_img)
                for cand in merged_images:
                    c = cand.lower().strip()
                    c_base = basename_from_url(c)
                    if req_img in c or c in req_img:
                        image_ok = True
                        break
                    if req_base and c_base and req_base == c_base:
                        image_ok = True
                        break
                if not image_ok:
                    lower_html = html.lower()
                    if req_img in lower_html or (req_base and req_base in lower_html):
                        image_ok = True

            limited = is_naver_dynamic_shell(final_url, html)

            if not req_text and not req_img:
                if merged_images or has_text:
                    print(json.dumps({"status": "success", "ok": True, "message": "홍보 텍스트 또는 이미지 확인됨"}, ensure_ascii=False))
                elif limited:
                    print(json.dumps({"status": "success", "ok": True, "message": "네이버 카페 동적 페이지(본문 제한) - URL 접근 확인"}, ensure_ascii=False))
                else:
                    print(json.dumps({"status": "success", "ok": False, "message": "홍보 텍스트/이미지 미확인"}, ensure_ascii=False))
                browser.close()
                return

            if text_ok and image_ok:
                print(json.dumps({"status": "success", "ok": True, "message": "검사 기준 충족"}, ensure_ascii=False))
            elif limited:
                print(json.dumps({"status": "success", "ok": False, "message": "네이버 카페 동적 페이지(본문 제한) - 필수 기준 확인 불가"}, ensure_ascii=False))
            elif (not text_ok) and (not image_ok):
                print(json.dumps({"status": "success", "ok": False, "message": "필수 텍스트/이미지 모두 미충족"}, ensure_ascii=False))
            elif not text_ok:
                print(json.dumps({"status": "success", "ok": False, "message": "필수 텍스트 미충족"}, ensure_ascii=False))
            else:
                print(json.dumps({"status": "success", "ok": False, "message": "필수 이미지 미충족"}, ensure_ascii=False))
            browser.close()
    except Exception as e:
        fail(str(e))


if __name__ == "__main__":
    main()
