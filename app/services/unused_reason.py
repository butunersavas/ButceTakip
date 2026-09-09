UNUSED_REASON_LABELS = {
    "purchase_cancelled": "Alımdan Vazgeçildi.",
    "no_longer_needed": "İhtiyaç Kalmadı.",
    "other_budget": "Başka Bütçeden Karşılandı.",
    "unused": "Kullanılmayacak.",
}

UNUSED_REASON_ALIASES = {
    **{code: code for code in UNUSED_REASON_LABELS},
    **{label: code for code, label in UNUSED_REASON_LABELS.items()},
    "Alımdan vazgeçildi": "purchase_cancelled",
    "İhtiyaç kalmadı": "no_longer_needed",
    "Başka Bütçe": "other_budget",
    "Kullanılmayacak": "unused",
}


def unused_reason_label(value: str | None) -> str:
    if not value:
        return ""
    code = UNUSED_REASON_ALIASES.get(value, value)
    return UNUSED_REASON_LABELS.get(code, "")
