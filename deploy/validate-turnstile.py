#!/usr/bin/env python3
"""Offline release preflight. Never calls Cloudflare or prints configuration values."""
import pathlib
import re
import sys


def validate(values):
    enabled = values.get("TURNSTILE_ENABLED", "true")
    if enabled not in ("true", "false"):
        return "Set TURNSTILE_ENABLED to true or false."
    if enabled == "false":
        return None
    test_keys = {
        "1x00000000000000000000AA", "2x00000000000000000000AB",
        "1x00000000000000000000BB", "2x00000000000000000000BB", "3x00000000000000000000FF",
        "1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA",
        "3x0000000000000000000000000000000AA",
    }
    for name in ("TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"):
        value = values.get(name, "").strip()
        if (not 10 <= len(value) <= 256 or any(c.isspace() for c in value)
                or "REPLACE" in value.upper() or "YOUR_" in value.upper()):
            return f"Set {name} to a complete key, not an example placeholder."
        if value in test_keys:
            return f"{name} must not be a Turnstile test key in production."
    host = values.get("DOMAIN", "")
    if not re.fullmatch(r"(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?", host) or any(
        not label or len(label) > 63 or label.startswith("-") or label.endswith("-")
        for label in host.split(".")
    ):
        return "Set DOMAIN to the expected Turnstile hostname without a scheme, port or path."
    return None


if __name__ == "__main__":
    values = {}
    for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
        if line.strip() and not line.lstrip().startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    problem = validate(values)
    if problem:
        sys.exit(problem)
