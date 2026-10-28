"""Fetch public stats of a YouTube Short. Usage: python3 -I fetch.py <url>"""
import re
import subprocess
import sys

vid = re.search(r"(?:shorts/|v=|youtu\.be/)([\w-]{11})", sys.argv[1]).group(1)
html = subprocess.run(
    ["curl", "-sS", "-A", "Mozilla/5.0", "-H", "Accept-Language: he,en",
     f"https://www.youtube.com/shorts/{vid}"],
    capture_output=True, text=True).stdout


def first(pat):
    m = re.search(pat, html)
    return m.group(1) if m else None


def num(s):
    return int(s.replace(",", "")) if s else None


channel = first(r'"(@(?!youtube")[A-Za-z0-9_.-]{3,})"')
views = num(first(r'"\d*?([0-9]{1,3}(?:,[0-9]{3})+) צפיות"') or first(r"([0-9,]+) צפיות"))
likes = num(first(r'"([0-9,]+) לייקים"'))
comments = num(first(r'"הצגת ([0-9,]+) תגובות"'))
published = first(r'"(?:publishTimeText|timestampText)":\{[^}]*?"(?:simpleText|text)":"([^"]+)"')
titles = [t for t in dict.fromkeys(re.findall(r'"content":"([^"]{10,300})"', html))
          if not t.startswith(("רוצה", "צריך", "זה עוזר", "היוצרים", "‪@"))]

print("channel:", channel)
print("title:", titles[:2])
print("published:", published)
print("views:", views)
print("likes:", likes, f"({likes / views:.2%})" if likes and views else "")
print("comments:", comments, f"({comments / views:.3%})" if comments and views else "")
