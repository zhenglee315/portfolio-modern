# ■—< CONST >———————————————————————————————————————————————————————————————————————————■ Caching
HELP_CACHING = {
    "title": "Caching Enabled",
    "description": (
        "### Caching Enabled\n"
        "⚡ **Enables or disables HTTP response caching.**\n\n"
        "- `true`: The response can be served from cache for faster access.\n"
        "- `false`: Fetch fresh data for this request.\n\n"
        "> _Use caching when a short delay before updated data appears is acceptable._"
    ),
    "examples": [True],
}


# ■—< CONST >———————————————————————————————————————————————————————————————————————————■ Locale
HELP_LOCALE = {
    "title": "Content Language",
    "description": (
        "### Content Language\n"
        "🌐 **Select the language of the portfolio content.**\n\n"
        "- `en`: English (default).\n"
        "- `zh-Hans`: Simplified Chinese.\n"
        "- `zh-Hant`: Traditional Chinese.\n\n"
        "> _Unsupported languages return 400 INVALID_LOCALE._"
    ),
    "examples": ["en"],
}
