"""Localised crop names shared by the brief and community alerts."""

from ..schemas import Lang

CROP_NAMES = {
    "onion": {"en": "onion", "hi": "प्याज़", "mr": "कांदा"},
    "tomato": {"en": "tomato", "hi": "टमाटर", "mr": "टोमॅटो"},
    "grapes": {"en": "grapes", "hi": "अंगूर", "mr": "द्राक्ष"},
    "soybean": {"en": "soybean", "hi": "सोयाबीन", "mr": "सोयाबीन"},
    "wheat": {"en": "wheat", "hi": "गेहूँ", "mr": "गहू"},
    "gram": {"en": "gram", "hi": "चना", "mr": "हरभरा"},
    "cotton": {"en": "cotton", "hi": "कपास", "mr": "कापूस"},
    "potato": {"en": "potato", "hi": "आलू", "mr": "बटाटा"},
    "pomegranate": {"en": "pomegranate", "hi": "अनार", "mr": "डाळिंब"},
    "sugarcane": {"en": "sugarcane", "hi": "गन्ना", "mr": "ऊस"},
    "maize": {"en": "maize", "hi": "मक्का", "mr": "मका"},
}

def crop_name(crop: str, lang: Lang) -> str:
    return CROP_NAMES.get(crop, {}).get(lang, crop)
