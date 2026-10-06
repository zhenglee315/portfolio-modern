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


# ■—< CONST >———————————————————————————————————————————————————————————————————————————■ Pagination
HELP_TOTAL = {
    "title": "Total Items",
    "description": (
        "### Total Items\n"
        "🔢 **Number of records matching the query across all pages.**\n\n"
        "- Counts matching records, including those outside the requested page.\n"
        "- Returns `0` when there are no matching records."
    ),
    "examples": [6],
}

HELP_PAGES = {
    "title": "Total Pages",
    "description": (
        "### Total Pages\n"
        "📚 **Number of pages available for the current query.**\n\n"
        "- Calculated from `total` and `size`.\n"
        "- Returns `0` when `total` is `0`."
    ),
    "examples": [1],
}

HELP_PAGE = {
    "title": "Page Number",
    "description": (
        "### Page Number\n"
        "📄 **Select the page to retrieve.**\n\n"
        "- Starts at `1`, which is the default.\n"
        "- A page beyond the end returns an empty `items` list.\n"
        "- Invalid values return `400 INVALID_PAGE`."
    ),
    "examples": [1],
}

HELP_SIZE = {
    "title": "Page Size",
    "description": (
        "### Page Size\n"
        "📦 **Number of records in one page.**\n\n"
        "- Numbered Portfolio pages use a fixed size of `6`.\n"
        "- Other values, including `all`, return `400 INVALID_SIZE`."
    ),
    "examples": [6],
}

HELP_ITEMS = {
    "title": "Items",
    "description": (
        "### Items\n"
        "🗂️ **Records returned for the requested page.**\n\n"
        "- Contains only records within this page.\n"
        "- An empty page returns `[]`."
    ),
    "examples": [[]],
}


# ■—< CONST >———————————————————————————————————————————————————————————————————————————■ Skill Owner
HELP_OWNER_TYPE = {
    "title": "Skill Owner Type",
    "description": (
        "### Skill Owner Type\n"
        "🗂️ **Choose the collection that owns the skill list.**\n\n"
        "- Only `category` is currently supported.\n"
        "- Other values return `400 INVALID_OWNER`."
    ),
    "examples": ["category"],
}

HELP_OWNER_ID = {
    "title": "Skill Category ID",
    "description": (
        "### Skill Category ID\n"
        "🏷️ **ID of the category whose skills should be returned.**\n\n"
        "- Required when querying `/portfolio/skills`.\n"
        "- An empty value returns `400 INVALID_OWNER_ID`."
    ),
    "examples": ["backend-apis"],
}
