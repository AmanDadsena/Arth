"""Crop names in the farmer's language, shared by the brief and the calendar."""

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
    "watermelon": {"en": "watermelon", "hi": "तरबूज़", "mr": "कलिंगड"},
}


def crop_name(crop: str, lang: Lang, capital: bool = False) -> str:
    name = CROP_NAMES.get(crop, {}).get(lang, crop)
    return name[:1].upper() + name[1:] if capital and lang == "en" else name
